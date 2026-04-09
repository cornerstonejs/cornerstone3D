jest.mock('../src/metaData', () => ({
  addProvider: jest.fn(),
  get: jest.fn(),
}));

import { OrientationAxis, VOILUTFunctionType } from '../src/enums';
import calculateTransform from '../src/RenderingEngine/helpers/cpuFallback/rendering/calculateTransform';
import canvasToPixel from '../src/RenderingEngine/helpers/cpuFallback/rendering/canvasToPixel';
import getDefaultViewport from '../src/RenderingEngine/helpers/cpuFallback/rendering/getDefaultViewport';
import * as metaData from '../src/metaData';
import {
  PlanarStackViewportCamera,
  PlanarVolumeViewportCamera,
} from '../src/RenderingEngine/ViewportNext/Planar';
import {
  resolvePlanarCpuImageDisplayedArea,
  resolvePlanarCpuViewportScale,
} from '../src/RenderingEngine/ViewportNext/Planar/planarCpuViewportMath';
import { resolvePlanarRenderCamera } from '../src/RenderingEngine/ViewportNext/Planar/planarRenderCamera';
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
    const camera = new PlanarStackViewportCamera({
      camera: {
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
      camera: {
        orientation: OrientationAxis.AXIAL,
      },
      canvasHeight: 257,
      canvasWidth: 513,
      currentImageIdIndex: 0,
      frameOfReferenceUID: 'image-for',
      image: createImage(),
      maxImageIdIndex: 0,
    };
    const vtkCamera = new PlanarStackViewportCamera({
      ...state,
      usePixelGridCenter: false,
    });
    const cpuCamera = new PlanarStackViewportCamera({
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

    const renderCamera = resolvePlanarRenderCamera({
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
      parallelScale: renderCamera.parallelScale,
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
    const camera = new PlanarStackViewportCamera({
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
    const camera = new PlanarStackViewportCamera({
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
    const camera = new PlanarStackViewportCamera({
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
    expect(horizontalFlip.state.camera.flipHorizontal).toBe(true);
    expect(verticalFlip.state.camera.flipVertical).toBe(true);
  });

  it('exposes indexToWorld for volume cameras', () => {
    const camera = new PlanarVolumeViewportCamera({
      camera: {
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
