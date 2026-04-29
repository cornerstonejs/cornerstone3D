jest.mock('../src/metaData', () => ({
  addProvider: jest.fn(),
  get: jest.fn(),
}));

import { OrientationAxis, VOILUTFunctionType } from '../src/enums';
import { ActorRenderMode } from '../src/types';
import calculateTransform from '../src/RenderingEngine/helpers/cpuFallback/rendering/calculateTransform';
import canvasToPixel from '../src/RenderingEngine/helpers/cpuFallback/rendering/canvasToPixel';
import getDefaultViewport from '../src/RenderingEngine/helpers/cpuFallback/rendering/getDefaultViewport';
import * as metaData from '../src/metaData';
import {
  PlanarStackResolvedView,
  PlanarVolumeResolvedView,
  resolvePlanarRenderPathProjection,
  resolvePlanarStackImageIdIndex,
} from '../src/RenderingEngine/ViewportNext/Planar';
import {
  resolvePlanarCpuImageDisplayedArea,
  resolvePlanarCpuViewportScale,
} from '../src/RenderingEngine/ViewportNext/Planar/planarCpuViewportMath';
import { resolvePlanarICamera } from '../src/RenderingEngine/ViewportNext/Planar/planarRenderCamera';
import { createPlanarImageSliceBasis } from '../src/RenderingEngine/ViewportNext/Planar/planarSliceBasis';

function createImage(imageId = 'image-1') {
  return {
    imageId,
    minPixelValue: 0,
    maxPixelValue: 255,
    slope: 1,
    intercept: 0,
    windowCenter: 127,
    windowWidth: 255,
    voiLUTFunction: VOILUTFunctionType.LINEAR,
    getPixelData: () => new Uint8Array(64 * 64),
    getCanvas: () => document.createElement('canvas'),
    rows: 64,
    columns: 64,
    height: 64,
    width: 64,
    color: false,
    rgba: false,
    numberOfComponents: 1,
    columnPixelSpacing: 1,
    rowPixelSpacing: 1,
    invert: false,
    sizeInBytes: 64 * 64,
    photometricInterpretation: 'MONOCHROME2',
    dataType: 'Uint8Array',
  };
}

function createImageVolume() {
  return {
    dimensions: [8, 10, 12],
    direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    spacing: [1, 2, 3],
    metadata: {
      FrameOfReferenceUID: 'volume-for',
    },
    imageData: {
      getDimensions: () => [8, 10, 12],
      indexToWorld: ([i, j, k]) => [10 + i, 20 + j * 2, 30 + k * 3],
    },
  };
}

function createProjectionContext({
  activeDataId = 'source',
  canvasHeight = 256,
  canvasWidth = 256,
  renderMode = ActorRenderMode.CPU_IMAGE,
  useVtk = false,
} = {}) {
  const canvas = document.createElement('canvas');

  canvas.height = canvasHeight;
  canvas.width = canvasWidth;

  const context = {
    viewportId: 'viewport',
    renderingEngineId: 'rendering-engine',
    type: 'planar',
    viewport: {
      element: document.createElement('div'),
      getActiveDataId: () => activeDataId,
      getOverlayActors: () => [],
      getViewState: () => ({ orientation: OrientationAxis.AXIAL }),
      isCurrentDataId: (dataId) => dataId === activeDataId,
    },
    renderPath: {
      renderMode,
    },
    view: {},
    display: {
      activateRenderMode: jest.fn(),
      renderNow: jest.fn(),
      requestRender: jest.fn(),
    },
  };

  if (useVtk) {
    return {
      ...context,
      vtk: {
        canvas,
        renderer: {},
      },
    };
  }

  return {
    ...context,
    cpu: {
      canvas,
      composition: {
        clearedRenderPassId: 0,
        renderPassId: 0,
      },
      context: {},
    },
  };
}

function expectPoint2Close(actual, expected, precision = 5) {
  expect(actual[0]).toBeCloseTo(expected[0], precision);
  expect(actual[1]).toBeCloseTo(expected[1], precision);
}

function expectPoint3Close(actual, expected, precision = 5) {
  expect(actual[0]).toBeCloseTo(expected[0], precision);
  expect(actual[1]).toBeCloseTo(expected[1], precision);
  expect(actual[2]).toBeCloseTo(expected[2], precision);
}

describe('Planar resolved cameras', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    metaData.get.mockImplementation((type) => {
      if (type === 'imagePixelModule') {
        return {
          bitsAllocated: 16,
          bitsStored: 16,
          highBit: 15,
          photometricInterpretation: 'MONOCHROME2',
          pixelRepresentation: 0,
          samplesPerPixel: 1,
        };
      }

      if (type === 'generalSeriesModule') {
        return {
          modality: 'CT',
        };
      }

      if (type === 'scalingModule' || type === 'calibratedPixelSpacing') {
        return undefined;
      }

      if (type === 'imagePlaneModule') {
        return {
          columnPixelSpacing: 1,
          rowPixelSpacing: 1,
          columnCosines: [0, 1, 0],
          rowCosines: [1, 0, 0],
          frameOfReferenceUID: 'image-for',
          imageOrientationPatient: [1, 0, 0, 0, 1, 0],
          imagePositionPatient: [0, 0, 0],
        };
      }
    });
  });

  it('round-trips between world and canvas for stack cameras', () => {
    const camera = new PlanarStackResolvedView({
      viewState: {
        orientation: OrientationAxis.AXIAL,
      },
      canvasHeight: 256,
      canvasWidth: 256,
      currentImageIdIndex: 0,
      frameOfReferenceUID: 'image-for',
      image: createImage(),
      maxImageIdIndex: 0,
      usePixelGridCenter: false,
    });
    const canvasPoint = [47, 123];
    const worldPoint = camera.canvasToWorld(canvasPoint);

    expectPoint2Close(camera.worldToCanvas(worldPoint), canvasPoint);
  });

  it('resolves identical stack image cameras for cpu and vtk image paths', () => {
    const state = {
      viewState: {
        orientation: OrientationAxis.AXIAL,
      },
      canvasHeight: 257,
      canvasWidth: 513,
      currentImageIdIndex: 0,
      frameOfReferenceUID: 'image-for',
      image: createImage(),
      maxImageIdIndex: 0,
    };
    const vtkCamera = new PlanarStackResolvedView({
      ...state,
      usePixelGridCenter: false,
    });
    const cpuCamera = new PlanarStackResolvedView({
      ...state,
      usePixelGridCenter: true,
    });
    const referenceCanvasPoint = [173, 91];
    const vtkResolvedCamera = vtkCamera.toICamera();
    const cpuResolvedCamera = cpuCamera.toICamera();

    expectPoint3Close(
      cpuResolvedCamera.focalPoint,
      vtkResolvedCamera.focalPoint
    );
    expectPoint3Close(cpuResolvedCamera.position, vtkResolvedCamera.position);
    expectPoint3Close(
      cpuResolvedCamera.viewPlaneNormal,
      vtkResolvedCamera.viewPlaneNormal
    );
    expectPoint3Close(cpuResolvedCamera.viewUp, vtkResolvedCamera.viewUp);
    expect(cpuResolvedCamera.parallelScale).toBeCloseTo(
      vtkResolvedCamera.parallelScale,
      5
    );
    expectPoint3Close(
      cpuCamera.canvasToWorld(referenceCanvasPoint),
      vtkCamera.canvasToWorld(referenceCanvasPoint)
    );

    const cpuTransformedCamera = cpuCamera
      .withZoom(1.75, referenceCanvasPoint)
      .withPan([24, -18])
      .flipHorizontal();
    const vtkTransformedCamera = vtkCamera
      .withZoom(1.75, referenceCanvasPoint)
      .withPan([24, -18])
      .flipHorizontal();
    const cpuResolvedTransformed = cpuTransformedCamera.toICamera();
    const vtkResolvedTransformed = vtkTransformedCamera.toICamera();

    expectPoint3Close(
      cpuResolvedTransformed.focalPoint,
      vtkResolvedTransformed.focalPoint
    );
    expectPoint3Close(
      cpuResolvedTransformed.position,
      vtkResolvedTransformed.position
    );
    expect(cpuResolvedTransformed.parallelScale).toBeCloseTo(
      vtkResolvedTransformed.parallelScale,
      5
    );
    expectPoint2Close(cpuTransformedCamera.pan, vtkTransformedCamera.pan);
    expectPoint2Close(
      cpuTransformedCamera.worldToCanvas(
        cpuTransformedCamera.canvasToWorld(referenceCanvasPoint)
      ),
      vtkTransformedCamera.worldToCanvas(
        vtkTransformedCamera.canvasToWorld(referenceCanvasPoint)
      )
    );
  });

  it('resolves image render path projections through the shared Planar view', () => {
    const image = createImage();
    const viewState = {
      orientation: OrientationAxis.AXIAL,
      scale: 1.75,
      anchorCanvas: [0.25, 0.75],
      flipHorizontal: true,
    };
    const cpuProjection = resolvePlanarRenderPathProjection({
      ctx: createProjectionContext({
        activeDataId: 'cpu',
        renderMode: ActorRenderMode.CPU_IMAGE,
      }),
      dataId: 'cpu',
      rendering: {
        renderMode: ActorRenderMode.CPU_IMAGE,
        currentImageIdIndex: 0,
        enabledElement: {
          image,
        },
      },
      viewState,
    });
    const vtkProjection = resolvePlanarRenderPathProjection({
      ctx: createProjectionContext({
        activeDataId: 'vtk',
        renderMode: ActorRenderMode.VTK_IMAGE,
        useVtk: true,
      }),
      dataId: 'vtk',
      rendering: {
        renderMode: ActorRenderMode.VTK_IMAGE,
        currentImage: image,
        currentImageIdIndex: 0,
      },
      viewState,
    });

    expectPoint3Close(
      cpuProjection.resolvedICamera.focalPoint,
      vtkProjection.resolvedICamera.focalPoint
    );
    expectPoint3Close(
      cpuProjection.resolvedICamera.viewPlaneNormal,
      vtkProjection.resolvedICamera.viewPlaneNormal
    );
    expect(cpuProjection.resolvedICamera.parallelScale).toBeCloseTo(
      vtkProjection.resolvedICamera.parallelScale,
      5
    );
    expect(cpuProjection.presentation.zoom).toBeCloseTo(
      vtkProjection.presentation.zoom,
      5
    );
    expect(cpuProjection.presentation.flipHorizontal).toBe(true);
  });

  it('preserves acquisition volume fallback index in render path cameras', () => {
    const imageVolume = createImageVolume();
    const rendering = {
      renderMode: ActorRenderMode.VTK_VOLUME_SLICE,
      currentImageIdIndex: 2,
      imageVolume,
    };
    const fallbackProjection = resolvePlanarRenderPathProjection({
      ctx: createProjectionContext({
        activeDataId: 'volume',
        renderMode: ActorRenderMode.VTK_VOLUME_SLICE,
        useVtk: true,
      }),
      dataId: 'volume',
      rendering,
      viewState: {
        orientation: OrientationAxis.ACQUISITION,
      },
    });
    const explicitProjection = resolvePlanarRenderPathProjection({
      ctx: createProjectionContext({
        activeDataId: 'volume',
        renderMode: ActorRenderMode.VTK_VOLUME_SLICE,
        useVtk: true,
      }),
      dataId: 'volume',
      rendering,
      viewState: {
        orientation: OrientationAxis.ACQUISITION,
        slice: {
          kind: 'stackIndex',
          imageIdIndex: 2,
        },
      },
    });

    expect(fallbackProjection.currentImageIdIndex).toBe(2);
    expectPoint3Close(
      fallbackProjection.resolvedICamera.focalPoint,
      explicitProjection.resolvedICamera.focalPoint
    );
  });

  it('keeps overlay projections tied to the active source camera', () => {
    const ctx = createProjectionContext();
    const sourceProjection = resolvePlanarRenderPathProjection({
      ctx,
      dataId: 'source',
      rendering: {
        renderMode: ActorRenderMode.CPU_IMAGE,
        currentImageIdIndex: 0,
        enabledElement: {
          image: createImage('source-image'),
        },
      },
      viewState: {
        orientation: OrientationAxis.AXIAL,
      },
    });
    const overlayProjection = resolvePlanarRenderPathProjection({
      ctx,
      dataId: 'overlay',
      rendering: {
        renderMode: ActorRenderMode.CPU_IMAGE,
        currentImageIdIndex: 0,
        enabledElement: {
          image: createImage('overlay-image'),
        },
      },
      viewState: {
        orientation: OrientationAxis.AXIAL,
      },
    });

    expect(ctx.view.activeSourceICamera).toBe(sourceProjection.resolvedICamera);
    expect(overlayProjection.isSourceBinding).toBe(false);
    expect(overlayProjection.activeSourceICamera).toBe(
      sourceProjection.resolvedICamera
    );
    expect(overlayProjection.resolvedICamera).not.toBe(
      sourceProjection.resolvedICamera
    );
  });

  it('resolves requested stack image index from Planar slice state', () => {
    expect(
      resolvePlanarStackImageIdIndex({
        fallbackImageIdIndex: 2,
        viewState: {
          slice: {
            kind: 'stackIndex',
            imageIdIndex: 7,
          },
        },
      })
    ).toBe(7);
    expect(
      resolvePlanarStackImageIdIndex({
        fallbackImageIdIndex: 2,
        viewState: {
          slice: {
            kind: 'volumePoint',
            sliceWorldPoint: [0, 0, 0],
          },
        },
      })
    ).toBe(2);
  });

  it('uses pixel-center lattice scaling for cpu stack image transforms', () => {
    const image = {
      ...createImage(),
      columns: 512,
      rows: 512,
      width: 512,
      height: 512,
    };
    const canvas = document.createElement('canvas');

    canvas.width = 500;
    canvas.height = 500;

    const activeSourceICamera = resolvePlanarICamera({
      sliceBasis: createPlanarImageSliceBasis({
        canvasHeight: canvas.height,
        canvasWidth: canvas.width,
        image,
      }),
      canvasHeight: canvas.height,
      canvasWidth: canvas.width,
    });
    const enabledElement = {
      canvas,
      image,
      renderingTools: {},
      viewport: getDefaultViewport(canvas, image),
    };

    enabledElement.viewport.displayedArea =
      resolvePlanarCpuImageDisplayedArea(image);
    enabledElement.viewport.scale = resolvePlanarCpuViewportScale({
      canvas,
      parallelScale: activeSourceICamera.parallelScale,
      columnPixelSpacing: image.columnPixelSpacing,
      rowPixelSpacing: image.rowPixelSpacing,
    });
    enabledElement.transform = calculateTransform(enabledElement);

    expect(
      canvasToPixel(enabledElement, [0, canvas.height / 2])[0]
    ).toBeCloseTo(0.5, 5);
    expect(
      canvasToPixel(enabledElement, [canvas.width, canvas.height / 2])[0]
    ).toBeCloseTo(511.5, 5);
  });

  it('uses half-pixel crop bounds for cpu stack image rasterization', () => {
    const image = {
      ...createImage(),
      columns: 512,
      rows: 512,
      width: 512,
      height: 512,
      columnPixelSpacing: 0.976562,
      rowPixelSpacing: 0.976562,
    };

    expect(resolvePlanarCpuImageDisplayedArea(image)).toEqual({
      tlhc: {
        x: 1.5,
        y: 1.5,
      },
      brhc: {
        x: 512.5,
        y: 512.5,
      },
      rowPixelSpacing: 0.976562,
      columnPixelSpacing: 0.976562,
      presentationSizeMode: 'NONE',
    });
  });

  it('keeps the zoom anchor stable when zooming at a canvas point', () => {
    const camera = new PlanarStackResolvedView({
      canvasHeight: 256,
      canvasWidth: 256,
      currentImageIdIndex: 0,
      frameOfReferenceUID: 'image-for',
      image: createImage(),
      maxImageIdIndex: 0,
      usePixelGridCenter: false,
    });
    const anchorCanvasPoint = [96, 144];
    const anchorWorldPoint = camera.canvasToWorld(anchorCanvasPoint);
    const zoomedCamera = camera.withZoom(2, anchorCanvasPoint);

    expectPoint3Close(
      zoomedCamera.canvasToWorld(anchorCanvasPoint),
      anchorWorldPoint
    );
    expect(zoomedCamera.zoom).toBeCloseTo(2, 5);
  });

  it('updates pan-derived transforms without recomputing ad hoc viewport math', () => {
    const camera = new PlanarStackResolvedView({
      canvasHeight: 256,
      canvasWidth: 256,
      currentImageIdIndex: 0,
      frameOfReferenceUID: 'image-for',
      image: createImage(),
      maxImageIdIndex: 0,
      usePixelGridCenter: false,
    });
    const centerWorldPoint = camera.canvasToWorld([128, 128]);
    const pannedCamera = camera.withPan([24, -18]);

    expectPoint2Close(pannedCamera.pan, [24, -18]);
    expectPoint2Close(pannedCamera.worldToCanvas(centerWorldPoint), [152, 110]);
  });

  it('mirrors transforms when flipped horizontally or vertically', () => {
    const camera = new PlanarStackResolvedView({
      canvasHeight: 256,
      canvasWidth: 256,
      currentImageIdIndex: 0,
      frameOfReferenceUID: 'image-for',
      image: createImage(),
      maxImageIdIndex: 0,
      usePixelGridCenter: false,
    });
    const referencePoint = [196, 84];
    const worldPoint = camera.canvasToWorld(referencePoint);
    const horizontalFlip = camera.flipHorizontal();
    const verticalFlip = camera.flipVertical();

    expectPoint2Close(horizontalFlip.worldToCanvas(worldPoint), [60, 84]);
    expectPoint2Close(verticalFlip.worldToCanvas(worldPoint), [196, 172]);
    expect(horizontalFlip.state.viewState.flipHorizontal).toBe(true);
    expect(verticalFlip.state.viewState.flipVertical).toBe(true);
  });

  it('exposes indexToWorld for volume cameras', () => {
    const camera = new PlanarVolumeResolvedView({
      viewState: {
        imageIdIndex: 4,
        orientation: OrientationAxis.AXIAL,
      },
      canvasHeight: 256,
      canvasWidth: 256,
      currentImageIdIndex: 4,
      frameOfReferenceUID: 'volume-for',
      imageVolume: createImageVolume(),
      maxImageIdIndex: 11,
    });

    expectPoint3Close(camera.indexToWorld([2, 3, 4]), [12, 26, 42]);
    expect(camera.getFrameOfReferenceUID()).toBe('volume-for');
  });
});
