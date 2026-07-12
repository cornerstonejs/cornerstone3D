jest.mock('../src/metaData', () => ({
  addProvider: jest.fn(),
  get: jest.fn(),
}));

import { OrientationAxis } from '../src/enums';
import { ActorRenderMode } from '../src/types';
import * as metaData from '../src/metaData';
import imageIdToURI from '../src/utilities/imageIdToURI';
import getVolumeViewReferenceId from '../src/utilities/getVolumeViewReferenceId';
import {
  getPlanarReferencedImageId,
  getPlanarViewReference,
  getPlanarViewReferenceId,
  isPlanarPlaneViewable,
  isPlanarReferenceViewable,
} from '../src/RenderingEngine/GenericViewport/Planar/planarViewReference';
import { resolvePlanarViewportView } from '../src/RenderingEngine/GenericViewport/Planar/PlanarResolvedView';
import PlanarViewReferenceController from '../src/RenderingEngine/GenericViewport/Planar/PlanarViewReferenceController';
import PlanarMountedData from '../src/RenderingEngine/GenericViewport/Planar/PlanarMountedData';

const IMAGE_FOR = 'image-for';
const VOLUME_FOR = 'volume-for';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function createImage(imageId = 'image-1') {
  return {
    imageId,
    minPixelValue: 0,
    maxPixelValue: 255,
    slope: 1,
    intercept: 0,
    windowCenter: 127,
    windowWidth: 255,
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

// Volume imageIds are encoded as `volumeImage:<volumeId>:<numSlices>:<index>`
// so the shared metaData mock can derive a consistent imagePositionPatient
// for `getClosestImageId` without any extra bookkeeping.
function createImageVolume({
  volumeId = 'volume-1',
  numSlices = 5,
  rows = 4,
  columns = 4,
  frameOfReferenceUID = VOLUME_FOR,
} = {}) {
  const imageIds = Array.from(
    { length: numSlices },
    (_, k) => `volumeImage:${volumeId}:${numSlices}:${k}`
  );

  return {
    volumeId,
    imageIds,
    dimensions: [columns, rows, numSlices],
    direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    spacing: [1, 1, 1],
    metadata: { FrameOfReferenceUID: frameOfReferenceUID },
    imageData: {
      getDimensions: () => [columns, rows, numSlices],
      getDirection: () => [1, 0, 0, 0, 1, 0, 0, 0, 1],
      getExtent: () => [0, columns - 1, 0, rows - 1, 0, numSlices - 1],
      extentToBounds: (extent) => extent,
      indexToWorld: ([i, j, k]) => [i, j, k],
    },
  };
}

function createCanvas(width = 256, height = 256) {
  const canvas = document.createElement('canvas');

  canvas.width = width;
  canvas.height = height;

  return canvas;
}

function createRenderContext({ activeDataId = 'data' } = {}) {
  return {
    viewportId: 'viewport',
    renderingEngineId: 'rendering-engine',
    type: 'planar',
    viewport: {
      element: document.createElement('div'),
      getActiveDataId: () => activeDataId,
      getOverlayActors: () => [],
      getViewState: () => ({}),
      isCurrentDataId: (dataId) => dataId === activeDataId,
    },
    renderPath: { renderMode: ActorRenderMode.CPU_IMAGE },
    view: {},
    display: {
      activateRenderMode: jest.fn(),
      renderNow: jest.fn(),
      requestRender: jest.fn(),
    },
    cpu: {
      canvas: createCanvas(),
      composition: { clearedRenderPassId: 0, renderPassId: 0 },
      context: {},
    },
    vtk: {
      canvas: createCanvas(),
      renderer: {},
    },
  };
}

function configureMetaDataMock() {
  metaData.get.mockImplementation((type, imageId) => {
    if (type === 'imagePlaneModule') {
      if (typeof imageId === 'string' && imageId.startsWith('volumeImage:')) {
        const parts = imageId.split(':');
        const index = Number(parts[parts.length - 1]);
        const numSlices = Number(parts[parts.length - 2]);

        return {
          columnPixelSpacing: 1,
          rowPixelSpacing: 1,
          columnCosines: [0, 1, 0],
          rowCosines: [1, 0, 0],
          frameOfReferenceUID: VOLUME_FOR,
          imageOrientationPatient: [1, 0, 0, 0, 1, 0],
          // Volumes are built so imageIds[k] IS IJK slice k: with the harness's
          // identity direction and indexToWorld, imageIds[k] sits at world
          // z = k. (A mirrored z here would model a volume whose imageId list
          // runs against its own k axis, which createAndCacheVolume never
          // produces, and would mask ordering bugs in index<->world code.)
          imagePositionPatient: [0, 0, index],
        };
      }

      return {
        columnPixelSpacing: 1,
        rowPixelSpacing: 1,
        columnCosines: [0, 1, 0],
        rowCosines: [1, 0, 0],
        frameOfReferenceUID: IMAGE_FOR,
        imageOrientationPatient: [1, 0, 0, 0, 1, 0],
        imagePositionPatient: [0, 0, 0],
      };
    }

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
      return { modality: 'CT' };
    }

    if (type === 'scalingModule' || type === 'calibratedPixelSpacing') {
      return undefined;
    }

    return undefined;
  });
}

// Stack (CPU_IMAGE) fixtures -------------------------------------------------

const STACK_IMAGE_IDS = ['stack:img-0', 'stack:img-1', 'stack:img-2'];

function createStackData() {
  return {
    imageIds: STACK_IMAGE_IDS,
    volumeId: undefined,
    renderMode: ActorRenderMode.CPU_IMAGE,
  };
}

function createStackRendering(currentImageIdIndex = 0) {
  return {
    renderMode: ActorRenderMode.CPU_IMAGE,
    currentImageIdIndex,
    maxImageIdIndex: STACK_IMAGE_IDS.length - 1,
    enabledElement: {
      image: createImage(STACK_IMAGE_IDS[currentImageIdIndex]),
    },
  };
}

// Expected geometry for the 64x64, unit-spacing, identity-orientation stack
// image used throughout: sliceCenterWorld = [31.5, 31.5, 0].
const STACK_FOCAL_POINT = [31.5, 31.5, 0];
const STACK_VIEW_PLANE_NORMAL = [0, 0, -1];
const STACK_VIEW_UP = [0, -1, 0];

// Volume (VTK_VOLUME_SLICE / AXIAL) fixtures --------------------------------

function createVolumeRendering(volume, currentImageIdIndex) {
  return {
    renderMode: ActorRenderMode.VTK_VOLUME_SLICE,
    currentImageIdIndex,
    maxImageIdIndex: volume.imageIds.length - 1,
    imageVolume: volume,
    imageIds: volume.imageIds,
  };
}

function createVolumeData(volume) {
  return {
    imageIds: volume.imageIds,
    volumeId: volume.volumeId,
    renderMode: ActorRenderMode.VTK_VOLUME_SLICE,
    imageVolume: volume,
  };
}

function axialViewState(imageIdIndex) {
  return {
    orientation: OrientationAxis.AXIAL,
    slice: { kind: 'stackIndex', imageIdIndex },
  };
}

// For the identity-direction, unit-spacing volume built by createImageVolume,
// AXIAL orientation resolves to viewPlaneNormal [0, 0, -1] and a focal point
// whose z coordinate is (numSlices - 1 - imageIdIndex). See the geometry
// derivation notes in the accompanying report.
function expectedAxialFocalZ(numSlices, imageIdIndex) {
  return numSlices - 1 - imageIdIndex;
}

describe('planarViewReference', () => {
  const renderContext = createRenderContext();

  beforeEach(() => {
    jest.clearAllMocks();
    configureMetaDataMock();
  });

  describe('getPlanarReferencedImageId - stack bindings', () => {
    it('returns the currently mounted imageId when no override is given', () => {
      const data = createStackData();
      const rendering = createStackRendering(1);

      expect(
        getPlanarReferencedImageId({
          viewState: {},
          data,
          rendering,
          renderContext,
        })
      ).toBe('stack:img-1');
    });

    it('honors an explicit sliceIndex specifier over the mounted index', () => {
      const data = createStackData();
      const rendering = createStackRendering(0);

      expect(
        getPlanarReferencedImageId({
          viewState: {},
          data,
          rendering,
          renderContext,
          viewRefSpecifier: { sliceIndex: 2 },
        })
      ).toBe('stack:img-2');
    });

    it('honors a stackIndex slice on the viewState when no specifier overrides it', () => {
      const data = createStackData();
      const rendering = createStackRendering(0);

      expect(
        getPlanarReferencedImageId({
          viewState: { slice: { kind: 'stackIndex', imageIdIndex: 2 } },
          data,
          rendering,
          renderContext,
        })
      ).toBe('stack:img-2');
    });

    it('prefers the specifier sliceIndex over a conflicting viewState slice', () => {
      const data = createStackData();
      const rendering = createStackRendering(0);

      expect(
        getPlanarReferencedImageId({
          viewState: { slice: { kind: 'stackIndex', imageIdIndex: 1 } },
          data,
          rendering,
          renderContext,
          viewRefSpecifier: { sliceIndex: 2 },
        })
      ).toBe('stack:img-2');
    });

    it('clamps out-of-range slice indices to the available image range', () => {
      const data = createStackData();
      const rendering = createStackRendering(0);

      expect(
        getPlanarReferencedImageId({
          viewState: {},
          data,
          rendering,
          renderContext,
          viewRefSpecifier: { sliceIndex: 99 },
        })
      ).toBe('stack:img-2');
      expect(
        getPlanarReferencedImageId({
          viewState: {},
          data,
          rendering,
          renderContext,
          viewRefSpecifier: { sliceIndex: -5 },
        })
      ).toBe('stack:img-0');
    });

    it('returns undefined when no rendering is mounted', () => {
      const data = createStackData();

      expect(
        getPlanarReferencedImageId({ viewState: {}, data, renderContext })
      ).toBeUndefined();
    });

    it('returns undefined when there are no imageIds to reference', () => {
      const data = { imageIds: [] };
      const rendering = createStackRendering(0);

      expect(
        getPlanarReferencedImageId({
          viewState: {},
          data,
          rendering,
          renderContext,
        })
      ).toBeUndefined();
    });
  });

  describe('getPlanarReferencedImageId - volume bindings', () => {
    it('finds the closest imageId for the current slice via the resolved camera', () => {
      const volume = createImageVolume({ volumeId: 'vol-a', numSlices: 5 });
      const data = createVolumeData(volume);
      const rendering = createVolumeRendering(volume, 2);

      expect(
        getPlanarReferencedImageId({
          viewState: axialViewState(2),
          data,
          rendering,
          renderContext,
        })
      ).toBe(volume.imageIds[2]);
    });

    it('resolves a different slice via an explicit sliceIndex specifier', () => {
      const volume = createImageVolume({ volumeId: 'vol-a', numSlices: 5 });
      const data = createVolumeData(volume);
      const rendering = createVolumeRendering(volume, 2);

      // A specifier sliceIndex addresses the CAMERA (scroll) ordering; for the
      // axial normal [0, 0, -1] camera slice 4 of 5 sits at world z = 0, which
      // is imageIds[0] (imageIds[k] sits at world z = k).
      expect(
        getPlanarReferencedImageId({
          viewState: axialViewState(2),
          data,
          rendering,
          renderContext,
          viewRefSpecifier: { sliceIndex: 4 },
        })
      ).toBe(volume.imageIds[0]);
    });
  });

  describe('getPlanarViewReference - stack bindings', () => {
    it('builds a ViewReference with FrameOfReferenceUID, focal point, orientation and referencedImageId', () => {
      const data = createStackData();
      const rendering = createStackRendering(1);
      const viewRef = getPlanarViewReference({
        viewState: {},
        dataId: 'stack-data',
        frameOfReferenceUID: 'for-x',
        data,
        rendering,
        renderContext,
      });

      expect(viewRef.FrameOfReferenceUID).toBe('for-x');
      expect(viewRef.dataId).toBe('stack-data');
      expect(viewRef.referencedImageId).toBe('stack:img-1');
      expect(viewRef.referencedImageURI).toBe(imageIdToURI('stack:img-1'));
      expect(viewRef.volumeId).toBeUndefined();
      expect(viewRef.sliceIndex).toBe(1);
      viewRef.cameraFocalPoint.forEach((value, index) =>
        expect(value).toBeCloseTo(STACK_FOCAL_POINT[index], 5)
      );
      viewRef.viewPlaneNormal.forEach((value, index) =>
        expect(value).toBeCloseTo(STACK_VIEW_PLANE_NORMAL[index], 5)
      );
      viewRef.viewUp.forEach((value, index) =>
        expect(value).toBeCloseTo(STACK_VIEW_UP[index], 5)
      );
      expect(viewRef.planeRestriction).toBeDefined();
      expect(viewRef.planeRestriction.FrameOfReferenceUID).toBe('for-x');
      expect(viewRef.planeRestriction.point).toEqual(viewRef.cameraFocalPoint);
      viewRef.planeRestriction.inPlaneVector1.forEach((value, index) =>
        expect(value).toBeCloseTo(STACK_VIEW_UP[index], 5)
      );
    });

    it('reports a different referencedImageId for a sliceIndex specifier without recomputing the mounted image geometry', () => {
      // Stack render paths mount exactly one IImage at a time; the camera
      // basis is derived from that mounted image's own geometry, not from
      // an index. Overriding sliceIndex therefore changes which imageId is
      // reported, while cameraFocalPoint still reflects the mounted image.
      const data = createStackData();
      const rendering = createStackRendering(1);
      const viewRef = getPlanarViewReference({
        viewState: {},
        frameOfReferenceUID: 'for-x',
        data,
        rendering,
        renderContext,
        viewRefSpecifier: { sliceIndex: 2 },
      });

      expect(viewRef.referencedImageId).toBe('stack:img-2');
      expect(viewRef.sliceIndex).toBe(2);
      viewRef.cameraFocalPoint.forEach((value, index) =>
        expect(value).toBeCloseTo(STACK_FOCAL_POINT[index], 5)
      );
    });

    it('populates multiSliceReference when rangeEndSliceIndex is beyond sliceIndex', () => {
      const data = createStackData();
      const rendering = createStackRendering(0);
      const viewRef = getPlanarViewReference({
        viewState: {},
        frameOfReferenceUID: 'for-x',
        data,
        rendering,
        renderContext,
        viewRefSpecifier: { sliceIndex: 0, rangeEndSliceIndex: 2 },
      });

      expect(viewRef.multiSliceReference).toEqual({
        FrameOfReferenceUID: 'for-x',
        referencedImageId: 'stack:img-2',
        referencedImageURI: imageIdToURI('stack:img-2'),
        sliceIndex: 2,
      });
    });

    it('omits multiSliceReference when rangeEndSliceIndex does not exceed sliceIndex', () => {
      const data = createStackData();
      const rendering = createStackRendering(1);
      const viewRef = getPlanarViewReference({
        viewState: {},
        frameOfReferenceUID: 'for-x',
        data,
        rendering,
        renderContext,
        viewRefSpecifier: { sliceIndex: 1, rangeEndSliceIndex: 1 },
      });

      expect(viewRef.multiSliceReference).toBeUndefined();
    });
  });

  describe('getPlanarViewReference - volume bindings', () => {
    it('includes volumeId and a slice-specific focal point/orientation for AXIAL orientation', () => {
      const volume = createImageVolume({ volumeId: 'vol-a', numSlices: 5 });
      const data = createVolumeData(volume);
      const rendering = createVolumeRendering(volume, 2);
      const viewRef = getPlanarViewReference({
        viewState: axialViewState(2),
        frameOfReferenceUID: VOLUME_FOR,
        data,
        rendering,
        renderContext,
      });

      expect(viewRef.volumeId).toBe('vol-a');
      expect(viewRef.referencedImageId).toBe(volume.imageIds[2]);
      expect(viewRef.viewPlaneNormal).toEqual([0, 0, -1]);
      expect(viewRef.viewUp).toEqual([0, -1, 0]);
      expect(viewRef.cameraFocalPoint[2]).toBeCloseTo(
        expectedAxialFocalZ(5, 2),
        5
      );
      expect(viewRef.sliceIndex).toBe(2);
    });

    it('recomputes the focal point for a different orientation-relative slice via viewRefSpecifier', () => {
      const volume = createImageVolume({ volumeId: 'vol-a', numSlices: 5 });
      const data = createVolumeData(volume);
      const rendering = createVolumeRendering(volume, 2);
      const viewRef = getPlanarViewReference({
        viewState: axialViewState(2),
        frameOfReferenceUID: VOLUME_FOR,
        data,
        rendering,
        renderContext,
        viewRefSpecifier: { sliceIndex: 4 },
      });

      // sliceIndex counts in CAMERA (scroll) order while referencedImageId
      // names the image actually displayed there: camera slice 4 sits at
      // world z = expectedAxialFocalZ(5, 4) = 0 = imageIds[0].
      expect(viewRef.referencedImageId).toBe(volume.imageIds[0]);
      expect(viewRef.sliceIndex).toBe(4);
      expect(viewRef.cameraFocalPoint[2]).toBeCloseTo(
        expectedAxialFocalZ(5, 4),
        5
      );
    });

    it('omits volumeId when forFrameOfReference is explicitly false', () => {
      const volume = createImageVolume({ volumeId: 'vol-a', numSlices: 5 });
      const data = createVolumeData(volume);
      const rendering = createVolumeRendering(volume, 2);
      const viewRef = getPlanarViewReference({
        viewState: axialViewState(2),
        frameOfReferenceUID: VOLUME_FOR,
        data,
        rendering,
        renderContext,
        viewRefSpecifier: { forFrameOfReference: false },
      });

      expect(viewRef.volumeId).toBeUndefined();
      // referencedImageId is still populated for image-level sync.
      expect(viewRef.referencedImageId).toBe(volume.imageIds[2]);
    });
  });

  describe('getPlanarViewReferenceId', () => {
    it('returns an imageId-based id for stack bindings', () => {
      const data = createStackData();
      const rendering = createStackRendering(1);

      expect(
        getPlanarViewReferenceId({
          viewState: {},
          data,
          rendering,
          renderContext,
        })
      ).toBe('imageId:stack:img-1');
    });

    it('changes with the requested stack slice index', () => {
      const data = createStackData();
      const rendering = createStackRendering(0);

      expect(
        getPlanarViewReferenceId({
          viewState: {},
          data,
          rendering,
          renderContext,
          viewRefSpecifier: { sliceIndex: 2 },
        })
      ).toBe('imageId:stack:img-2');
    });

    it('returns null when no rendering is mounted', () => {
      const data = createStackData();

      expect(
        getPlanarViewReferenceId({ viewState: {}, data, renderContext })
      ).toBeNull();
    });

    it('returns a volume-scoped id that varies with slice index and orientation for volume bindings', () => {
      const volume = createImageVolume({ volumeId: 'vol-a', numSlices: 5 });
      const data = createVolumeData(volume);
      const rendering = createVolumeRendering(volume, 2);
      const axialId = getPlanarViewReferenceId({
        viewState: axialViewState(2),
        data,
        rendering,
        renderContext,
      });

      expect(axialId).toBe(
        getVolumeViewReferenceId({
          sliceIndex: 2,
          viewPlaneNormal: [0, 0, -1],
          volumeId: 'vol-a',
        })
      );

      const otherSliceId = getPlanarViewReferenceId({
        viewState: axialViewState(2),
        data,
        rendering,
        renderContext,
        viewRefSpecifier: { sliceIndex: 3 },
      });

      expect(otherSliceId).not.toBe(axialId);
      expect(otherSliceId).toContain('sliceIndex=3');
    });

    it('returns null for a volume binding without a volumeId', () => {
      const volume = createImageVolume({ volumeId: 'vol-a', numSlices: 5 });
      const data = { ...createVolumeData(volume), volumeId: undefined };
      const rendering = createVolumeRendering(volume, 2);

      expect(
        getPlanarViewReferenceId({
          viewState: axialViewState(2),
          data,
          rendering,
          renderContext,
        })
      ).toBeNull();
    });
  });

  describe('isPlanarPlaneViewable', () => {
    const rendering = createStackRendering(0);
    const base = {
      viewState: {},
      frameOfReferenceUID: 'for-x',
      renderContext,
      rendering,
    };

    it('accepts a plane restriction that is coplanar with the current view', () => {
      const coplanar = {
        FrameOfReferenceUID: 'for-x',
        point: [10, 10, 0],
        inPlaneVector1: [0, -1, 0],
        inPlaneVector2: [1, 0, 0],
      };

      expect(
        isPlanarPlaneViewable({ ...base, planeRestriction: coplanar })
      ).toBe(true);
    });

    it('rejects a plane restriction offset along the view plane normal', () => {
      const offPlane = {
        FrameOfReferenceUID: 'for-x',
        point: [10, 10, 5],
        inPlaneVector1: [0, -1, 0],
        inPlaneVector2: [1, 0, 0],
      };

      expect(
        isPlanarPlaneViewable({ ...base, planeRestriction: offPlane })
      ).toBe(false);
    });

    it('rejects a plane restriction whose in-plane vectors are not orthogonal to the view plane normal', () => {
      const tilted = {
        FrameOfReferenceUID: 'for-x',
        point: STACK_FOCAL_POINT,
        inPlaneVector1: [0, 0, 1],
        inPlaneVector2: [1, 0, 0],
      };

      expect(isPlanarPlaneViewable({ ...base, planeRestriction: tilted })).toBe(
        false
      );
    });

    it('rejects a plane restriction from a different FrameOfReferenceUID', () => {
      const mismatched = {
        FrameOfReferenceUID: 'for-other',
        point: STACK_FOCAL_POINT,
        inPlaneVector1: [0, -1, 0],
        inPlaneVector2: [1, 0, 0],
      };

      expect(
        isPlanarPlaneViewable({ ...base, planeRestriction: mismatched })
      ).toBe(false);
    });

    it('accepts withOrientation regardless of the plane point when the FrameOfReferenceUID matches', () => {
      const offPlane = {
        FrameOfReferenceUID: 'for-x',
        point: [10, 10, 999],
        inPlaneVector1: [0, -1, 0],
        inPlaneVector2: [1, 0, 0],
      };

      expect(
        isPlanarPlaneViewable({
          ...base,
          planeRestriction: offPlane,
          options: { withOrientation: true },
        })
      ).toBe(true);
    });

    it('accepts withNavigation for an off-plane point but still requires compatible orientation', () => {
      const offPlaneCompatible = {
        FrameOfReferenceUID: 'for-x',
        point: [10, 10, 999],
        inPlaneVector1: [0, -1, 0],
        inPlaneVector2: [1, 0, 0],
      };
      const offPlaneIncompatible = {
        FrameOfReferenceUID: 'for-x',
        point: [10, 10, 999],
        inPlaneVector1: [0, 0, 1],
        inPlaneVector2: [1, 0, 0],
      };

      expect(
        isPlanarPlaneViewable({
          ...base,
          planeRestriction: offPlaneCompatible,
          options: { withNavigation: true },
        })
      ).toBe(true);
      expect(
        isPlanarPlaneViewable({
          ...base,
          planeRestriction: offPlaneIncompatible,
          options: { withNavigation: true },
        })
      ).toBe(false);
    });

    it('returns false when there is no active rendering to resolve a camera from', () => {
      const coplanar = {
        FrameOfReferenceUID: 'for-x',
        point: [10, 10, 0],
        inPlaneVector1: [0, -1, 0],
        inPlaneVector2: [1, 0, 0],
      };

      expect(
        isPlanarPlaneViewable({
          ...base,
          rendering: undefined,
          planeRestriction: coplanar,
        })
      ).toBe(false);
    });
  });

  describe('isPlanarReferenceViewable', () => {
    const rendering = createStackRendering(1);
    const base = {
      viewState: {},
      frameOfReferenceUID: 'for-x',
      imageIds: STACK_IMAGE_IDS,
      renderContext,
      rendering,
    };

    it('returns false when no ViewReference is given', () => {
      expect(isPlanarReferenceViewable({ ...base, viewRef: undefined })).toBe(
        false
      );
    });

    it('rejects a mismatched FrameOfReferenceUID', () => {
      expect(
        isPlanarReferenceViewable({
          ...base,
          viewRef: { FrameOfReferenceUID: 'for-other' },
        })
      ).toBe(false);
    });

    it('matches the currently displayed imageId', () => {
      expect(
        isPlanarReferenceViewable({
          ...base,
          viewRef: {
            FrameOfReferenceUID: 'for-x',
            referencedImageId: 'stack:img-1',
          },
        })
      ).toBe(true);
    });

    it('rejects a reference to another imageId without withNavigation', () => {
      expect(
        isPlanarReferenceViewable({
          ...base,
          viewRef: {
            FrameOfReferenceUID: 'for-x',
            referencedImageId: 'stack:img-2',
          },
        })
      ).toBe(false);
    });

    it('accepts a reference to another imageId when withNavigation is set', () => {
      expect(
        isPlanarReferenceViewable({
          ...base,
          options: { withNavigation: true },
          viewRef: {
            FrameOfReferenceUID: 'for-x',
            referencedImageId: 'stack:img-2',
          },
        })
      ).toBe(true);
    });

    it('rejects a reference to an imageId that is not part of this viewport', () => {
      expect(
        isPlanarReferenceViewable({
          ...base,
          options: { withNavigation: true },
          viewRef: {
            FrameOfReferenceUID: 'for-x',
            referencedImageId: 'not-a-member:image',
          },
        })
      ).toBe(false);
    });

    it('accepts an in-range multiSliceReference around the current slice', () => {
      expect(
        isPlanarReferenceViewable({
          ...base,
          viewRef: {
            FrameOfReferenceUID: 'for-x',
            referencedImageId: 'stack:img-0',
            multiSliceReference: { referencedImageId: 'stack:img-2' },
          },
        })
      ).toBe(true);
    });

    it('rejects a multiSliceReference range that does not include the current slice', () => {
      const otherRendering = createStackRendering(0);

      expect(
        isPlanarReferenceViewable({
          ...base,
          rendering: otherRendering,
          viewRef: {
            FrameOfReferenceUID: 'for-x',
            referencedImageId: 'stack:img-1',
            multiSliceReference: { referencedImageId: 'stack:img-2' },
          },
        })
      ).toBe(false);
    });

    it('rejects an orientation (viewPlaneNormal) mismatch by default', () => {
      expect(
        isPlanarReferenceViewable({
          ...base,
          viewRef: {
            FrameOfReferenceUID: 'for-x',
            viewPlaneNormal: [1, 0, 0],
          },
        })
      ).toBe(false);
    });

    it('accepts an orientation mismatch when withOrientation is set', () => {
      expect(
        isPlanarReferenceViewable({
          ...base,
          options: { withOrientation: true },
          viewRef: {
            FrameOfReferenceUID: 'for-x',
            viewPlaneNormal: [1, 0, 0],
          },
        })
      ).toBe(true);
    });

    it('treats a negated (flipped) viewPlaneNormal as orientation-compatible', () => {
      expect(
        isPlanarReferenceViewable({
          ...base,
          viewRef: {
            FrameOfReferenceUID: 'for-x',
            viewPlaneNormal: [0, 0, 1],
          },
        })
      ).toBe(true);
    });

    it('matches by sliceIndex when no image identity is given', () => {
      expect(
        isPlanarReferenceViewable({
          ...base,
          viewRef: { FrameOfReferenceUID: 'for-x', sliceIndex: 1 },
        })
      ).toBe(true);
      expect(
        isPlanarReferenceViewable({
          ...base,
          viewRef: { FrameOfReferenceUID: 'for-x', sliceIndex: 0 },
        })
      ).toBe(false);
    });

    it('matches an inclusive sliceIndex range', () => {
      expect(
        isPlanarReferenceViewable({
          ...base,
          viewRef: { FrameOfReferenceUID: 'for-x', sliceIndex: [0, 2] },
        })
      ).toBe(true);
      expect(
        isPlanarReferenceViewable({
          ...base,
          viewRef: { FrameOfReferenceUID: 'for-x', sliceIndex: [2, 2] },
        })
      ).toBe(false);
    });

    it('treats a reference with no sliceIndex or image identity as viewable', () => {
      expect(
        isPlanarReferenceViewable({
          ...base,
          viewRef: { FrameOfReferenceUID: 'for-x' },
        })
      ).toBe(true);
    });

    it('delegates to isPlanarPlaneViewable when a planeRestriction is present', () => {
      const coplanar = {
        FrameOfReferenceUID: 'for-x',
        point: STACK_FOCAL_POINT,
        inPlaneVector1: [0, -1, 0],
        inPlaneVector2: [1, 0, 0],
      };
      const offPlane = { ...coplanar, point: [10, 10, 5] };

      expect(
        isPlanarReferenceViewable({
          ...base,
          viewRef: { FrameOfReferenceUID: 'for-x', planeRestriction: coplanar },
        })
      ).toBe(true);
      expect(
        isPlanarReferenceViewable({
          ...base,
          viewRef: { FrameOfReferenceUID: 'for-x', planeRestriction: offPlane },
        })
      ).toBe(false);
    });

    it('returns false for any reference when there is no active rendering', () => {
      expect(
        isPlanarReferenceViewable({
          ...base,
          rendering: undefined,
          viewRef: { FrameOfReferenceUID: 'for-x' },
        })
      ).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// PlanarViewReferenceController
// ---------------------------------------------------------------------------

function createMountedData(bindings) {
  return new PlanarMountedData({
    getBinding: (dataId) => bindings.get(dataId),
    getFirstBinding: () => bindings.values().next().value,
    getBindings: () => bindings.entries(),
    removeData: (dataId) => bindings.delete(dataId),
  });
}

function createStackBinding({
  dataId,
  frameOfReferenceUID = 'for-1',
  imageIds,
  role = 'overlay',
  currentImageIdIndex = 0,
}) {
  return {
    data: {
      id: dataId,
      type: 'image',
      imageIds,
      initialImageIdIndex: currentImageIdIndex,
      volumeId: undefined,
    },
    role,
    rendering: {
      renderMode: ActorRenderMode.CPU_IMAGE,
      currentImageIdIndex,
      maxImageIdIndex: imageIds.length - 1,
      enabledElement: { image: createImage(imageIds[currentImageIdIndex]) },
    },
    applyViewState: jest.fn(),
    getActorEntry: () => ({
      actor: {},
      referencedId: dataId,
      uid: `${dataId}-actor`,
    }),
    getFrameOfReferenceUID: () => frameOfReferenceUID,
    removeData: jest.fn(),
    updateDataPresentation: jest.fn(),
  };
}

function createVolumeBinding({
  dataId,
  volume,
  role = 'overlay',
  currentImageIdIndex,
}) {
  const idx =
    currentImageIdIndex ?? Math.floor((volume.imageIds.length - 1) / 2);

  return {
    data: {
      id: dataId,
      type: 'volume',
      volumeId: volume.volumeId,
      imageIds: volume.imageIds,
      imageVolume: volume,
    },
    role,
    rendering: createVolumeRendering(volume, idx),
    applyViewState: jest.fn(),
    getActorEntry: () => ({
      actor: {},
      referencedId: volume.volumeId,
      uid: `${dataId}-actor`,
    }),
    getFrameOfReferenceUID: () => volume.metadata.FrameOfReferenceUID,
    removeData: jest.fn(),
    updateDataPresentation: jest.fn(),
  };
}

// Builds a PlanarViewReferenceController host backed by real bindings, a real
// PlanarMountedData instance, and the real resolvePlanarViewportView/
// getPlanar* functions (not stubs), so the controller tests exercise the same
// geometry pipeline as the pure-function tests above.
function createControllerHarness(bindingEntries) {
  const bindings = new Map(bindingEntries);
  const mountedData = createMountedData(bindings);
  const renderContext = createRenderContext();
  let viewState = {};

  const render = jest.fn();
  const setImageIdIndex = jest.fn((imageIdIndex) => {
    const binding = mountedData.getCurrentBinding();

    binding.rendering.currentImageIdIndex = imageIdIndex;

    return Promise.resolve(binding.data.imageIds[imageIdIndex]);
  });
  const setViewState = jest.fn((patch) => {
    viewState = { ...viewState, ...patch };
  });
  const updateBindingsCameraState = jest.fn();
  const promoteSourceDataId = jest.fn((dataId) =>
    mountedData.promoteSourceDataId(dataId)
  );
  const getVolumeSliceWorldPointForImageIdIndex = jest.fn((imageIdIndex) => [
    0,
    0,
    imageIdIndex,
  ]);

  const host = {
    viewportId: 'viewport-1',
    viewportType: 'planar',
    getActiveDataId: () => mountedData.getActiveDataId(),
    getBinding: (dataId) => bindings.get(dataId),
    getBindings: () => bindings.entries(),
    getCurrentBinding: () => mountedData.getCurrentBinding(),
    getRenderContext: () => renderContext,
    getResolvedView: (args = {}) => {
      const binding = mountedData.getCurrentBinding();

      if (!binding) {
        return undefined;
      }

      const resolved = resolvePlanarViewportView({
        viewState,
        data: binding.data,
        frameOfReferenceUID:
          args.frameOfReferenceUID ?? binding.getFrameOfReferenceUID(),
        rendering: binding.rendering,
        renderContext,
        sliceIndex: args.sliceIndex,
      });

      if (!resolved) {
        return undefined;
      }

      return {
        getFrameOfReferenceUID: () => binding.getFrameOfReferenceUID(),
        toICamera: () => resolved.toICamera(),
      };
    },
    getViewState: () => viewState,
    getVolumeSliceWorldPointForImageIdIndex,
    promoteSourceDataId,
    render,
    setImageIdIndex,
    setViewState,
    updateBindingsCameraState,
  };
  const controller = new PlanarViewReferenceController(host);

  return {
    bindings,
    controller,
    getVolumeSliceWorldPointForImageIdIndex,
    getViewState: () => viewState,
    host,
    mountedData,
    promoteSourceDataId,
    render,
    // Seeds the initial viewState directly, bypassing the setViewState spy
    // so test setup doesn't pollute the call history asserted on below.
    seedViewState: (patch) => {
      viewState = { ...viewState, ...patch };
    },
    setImageIdIndex,
    setViewState,
    updateBindingsCameraState,
  };
}

describe('PlanarViewReferenceController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    configureMetaDataMock();
  });

  describe('stack + stack overlay bindings', () => {
    function createHarness() {
      const source = createStackBinding({
        dataId: 'source',
        imageIds: ['src:0', 'src:1', 'src:2'],
        role: 'source',
        currentImageIdIndex: 1,
      });
      const overlay = createStackBinding({
        dataId: 'overlay',
        imageIds: ['ovl:0'],
      });
      const harness = createControllerHarness([
        ['source', source],
        ['overlay', overlay],
      ]);

      harness.mountedData.promoteSourceDataId('source');

      return harness;
    }

    it('activates the binding that owns a referenced imageId before navigating', () => {
      const harness = createHarness();

      harness.controller.setViewReference({
        FrameOfReferenceUID: 'for-1',
        referencedImageId: 'ovl:0',
      });

      expect(harness.mountedData.getActiveDataId()).toBe('overlay');
      expect(harness.updateBindingsCameraState).toHaveBeenCalledTimes(1);
      expect(harness.setImageIdIndex).toHaveBeenCalledWith(0);
      // Applying the reference succeeded, so no extra forced render is needed.
      expect(harness.render).not.toHaveBeenCalled();
    });

    it('navigates within the active binding via referencedImageId without switching bindings', () => {
      const harness = createHarness();

      harness.controller.setViewReference({
        FrameOfReferenceUID: 'for-1',
        referencedImageId: 'src:2',
      });

      expect(harness.mountedData.getActiveDataId()).toBe('source');
      expect(harness.promoteSourceDataId).not.toHaveBeenCalled();
      expect(harness.setImageIdIndex).toHaveBeenCalledWith(2);
    });

    it('navigates within the active binding via a bare sliceIndex', () => {
      const harness = createHarness();

      harness.controller.setViewReference({
        FrameOfReferenceUID: 'for-1',
        sliceIndex: 2,
      });

      expect(harness.setImageIdIndex).toHaveBeenCalledWith(2);
    });

    it('is a silent no-op for a FrameOfReference-only reference on the already-active binding', () => {
      const harness = createHarness();

      harness.controller.setViewReference({ FrameOfReferenceUID: 'for-1' });

      expect(harness.promoteSourceDataId).not.toHaveBeenCalled();
      expect(harness.setImageIdIndex).not.toHaveBeenCalled();
      expect(harness.render).not.toHaveBeenCalled();
    });

    it('refuses (no-ops) a reference whose FrameOfReferenceUID matches no binding and carries no other identity', () => {
      const harness = createHarness();

      harness.controller.setViewReference({
        FrameOfReferenceUID: 'for-unknown',
      });

      expect(harness.promoteSourceDataId).not.toHaveBeenCalled();
      expect(harness.updateBindingsCameraState).not.toHaveBeenCalled();
      expect(harness.setImageIdIndex).not.toHaveBeenCalled();
      expect(harness.render).not.toHaveBeenCalled();
    });

    it('does nothing when setViewReference is called with a falsy reference', () => {
      const harness = createHarness();

      harness.controller.setViewReference(undefined);

      expect(harness.promoteSourceDataId).not.toHaveBeenCalled();
      expect(harness.render).not.toHaveBeenCalled();
    });

    it('activates a targeted binding by dataId and forces a render even when no image reference applies', () => {
      const harness = createHarness();

      harness.controller.setViewReference({ dataId: 'overlay' });

      expect(harness.mountedData.getActiveDataId()).toBe('overlay');
      // Activation succeeded but nothing could be applied (no imageId or
      // sliceIndex on the reference), so the controller forces a render to
      // reflect the promoted binding.
      expect(harness.setImageIdIndex).not.toHaveBeenCalled();
      expect(harness.render).toHaveBeenCalledTimes(1);
    });

    it('delegates getViewReference/getViewReferenceId/getCurrentImageId to the active binding', () => {
      const harness = createHarness();

      expect(harness.controller.getCurrentImageId()).toBe('src:1');
      expect(harness.controller.getViewReference().referencedImageId).toBe(
        'src:1'
      );
      expect(harness.controller.getViewReferenceId()).toBe('imageId:src:1');
    });

    it('reports the resolved FrameOfReferenceUID from the active binding, falling back to a synthetic id without one', () => {
      const harness = createHarness();

      expect(harness.controller.getFrameOfReferenceUID()).toBe('for-1');

      const emptyHarness = createControllerHarness([]);

      expect(emptyHarness.controller.getFrameOfReferenceUID()).toBe(
        'planar-viewport-viewport-1'
      );
    });

    it('reports isPlaneViewable consistently with the standalone isPlanarPlaneViewable check', () => {
      const harness = createHarness();
      const coplanar = {
        FrameOfReferenceUID: 'for-1',
        point: STACK_FOCAL_POINT,
        inPlaneVector1: [0, -1, 0],
        inPlaneVector2: [1, 0, 0],
      };
      const offPlane = { ...coplanar, point: [10, 10, 5] };

      expect(harness.controller.isPlaneViewable(coplanar)).toBe(true);
      expect(harness.controller.isPlaneViewable(offPlane)).toBe(false);
    });

    it('builds per-binding reference view contexts for both source and overlay bindings', () => {
      const harness = createHarness();
      const contexts = harness.controller.getReferenceViewContexts([]);

      expect(contexts).toHaveLength(2);

      const overlayContext = contexts.find((ctx) => ctx.dataId === 'overlay');
      const sourceContext = contexts.find((ctx) => ctx.dataId === 'source');

      expect(overlayContext.imageIds).toEqual(['ovl:0']);
      expect(overlayContext.currentImageIdIndex).toBe(0);
      expect(sourceContext.imageIds).toEqual(['src:0', 'src:1', 'src:2']);
      expect(sourceContext.currentImageIdIndex).toBe(1);
    });

    it('falls back to the supplied contexts when there are no bindings', () => {
      const harness = createControllerHarness([]);
      const fallback = [{ dataId: 'fallback', imageIds: [] }];

      expect(harness.controller.getReferenceViewContexts(fallback)).toBe(
        fallback
      );
    });
  });

  describe('stack source + volume overlay bindings', () => {
    function createHarness() {
      const volume = createImageVolume({
        volumeId: 'vol-shared',
        numSlices: 5,
      });
      const source = createStackBinding({
        dataId: 'source',
        imageIds: ['src:0', 'src:1', 'src:2'],
        role: 'source',
        currentImageIdIndex: 0,
      });
      const overlay = createVolumeBinding({
        dataId: 'overlay',
        volume,
        currentImageIdIndex: 2,
      });
      const harness = createControllerHarness([
        ['source', source],
        ['overlay', overlay],
      ]);

      harness.mountedData.promoteSourceDataId('source');
      // The overlay binding needs a viewState carrying an explicit
      // orientation + slice for its AXIAL camera to resolve deterministically
      // once activated.
      harness.seedViewState(axialViewState(2));

      return { harness, volume };
    }

    it('resolves getViewReference by volumeId to a non-active binding', () => {
      const { harness, volume } = createHarness();
      const viewRef = harness.controller.getViewReference({
        volumeId: volume.volumeId,
      });

      expect(viewRef.volumeId).toBe(volume.volumeId);
      expect(viewRef.referencedImageId).toBe(volume.imageIds[2]);
    });

    it('getVolumeId falls back to the active binding volumeId when unspecified, and is undefined for a stack source', () => {
      const { harness } = createHarness();

      expect(harness.controller.getVolumeId()).toBeUndefined();
    });

    it('activates the volume overlay by volumeId even though it also matches no imageId reference', () => {
      const { harness, volume } = createHarness();

      harness.controller.setViewReference({
        FrameOfReferenceUID: volume.metadata.FrameOfReferenceUID,
        volumeId: volume.volumeId,
        viewPlaneNormal: [0, 0, -1],
        sliceIndex: 3,
      });

      expect(harness.mountedData.getActiveDataId()).toBe('overlay');
      expect(harness.setViewState).toHaveBeenCalled();
      expect(harness.getViewState().slice).toEqual({
        kind: 'volumePoint',
        sliceWorldPoint: [0, 0, 3],
      });
    });

    it('falls back to imageId membership to pick the right binding when volumeId does not match any binding', () => {
      const { harness } = createHarness();

      harness.controller.setViewReference({
        FrameOfReferenceUID: 'for-1',
        volumeId: 'no-such-volume',
        referencedImageId: 'src:2',
      });

      expect(harness.mountedData.getActiveDataId()).toBe('source');
      expect(harness.setImageIdIndex).toHaveBeenCalledWith(2);
    });
  });

  describe('volume binding navigation', () => {
    function createHarness({ numSlices = 5 } = {}) {
      const volume = createImageVolume({ volumeId: 'vol-a', numSlices });
      const binding = createVolumeBinding({
        dataId: 'volume-data',
        volume,
        role: 'source',
        currentImageIdIndex: 2,
      });
      const harness = createControllerHarness([['volume-data', binding]]);

      harness.mountedData.promoteSourceDataId('volume-data');
      harness.seedViewState(axialViewState(2));

      return { harness, volume };
    }

    it('navigates to a sliceIndex on the same orientation without reorienting', () => {
      const { harness, volume } = createHarness();

      harness.controller.setViewReference({
        FrameOfReferenceUID: volume.metadata.FrameOfReferenceUID,
        volumeId: volume.volumeId,
        viewPlaneNormal: [0, 0, -1],
        sliceIndex: 4,
      });

      const patch = harness.setViewState.mock.calls[0][0];

      expect(patch.orientation).toBeUndefined();
      expect(patch.slice).toEqual({
        kind: 'volumePoint',
        sliceWorldPoint: [0, 0, 4],
      });
    });

    it('navigates a referencedImageId to that slice`s exact world center, not its camera-order mirror', () => {
      const { harness, volume } = createHarness();

      harness.controller.setViewReference({
        FrameOfReferenceUID: volume.metadata.FrameOfReferenceUID,
        referencedImageId: volume.imageIds[1],
      });

      // imageIds[k] is IJK slice k, so the target is indexToWorld([1.5, 1.5, 1])
      // — computed from the volume geometry, NOT via the camera-order
      // getVolumeSliceWorldPointForImageIdIndex walk (whose ordering runs
      // against the imageId list for the acquisition/axial normal and would
      // land on the mirrored slice).
      expect(
        harness.getVolumeSliceWorldPointForImageIdIndex
      ).not.toHaveBeenCalled();
      expect(harness.getViewState().slice).toEqual({
        kind: 'volumePoint',
        sliceWorldPoint: [1.5, 1.5, 1],
      });
      // Round-trip: the viewport now reports the referenced image as current.
      expect(harness.controller.getCurrentImageId()).toBe(volume.imageIds[1]);
    });

    it('resolves a world focal point to the geometrically closest slice', () => {
      const { harness, volume } = createHarness();

      harness.controller.setViewReference({
        FrameOfReferenceUID: volume.metadata.FrameOfReferenceUID,
        volumeId: volume.volumeId,
        viewPlaneNormal: [0, 0, -1],
        cameraFocalPoint: [0, 0, 2],
      });

      expect(harness.getViewState().slice).toEqual({
        kind: 'volumePoint',
        sliceWorldPoint: [0, 0, 2],
      });
      // The volume-point slice state should resolve, geometrically, back to
      // imageId index 2 (imageIds[k] sits at world z = k).
      expect(harness.controller.getCurrentImageId()).toBe(volume.imageIds[2]);
    });

    it('reorients to a new viewPlaneNormal/viewUp supplied directly on the reference', () => {
      const { harness, volume } = createHarness();

      harness.controller.setViewReference({
        FrameOfReferenceUID: volume.metadata.FrameOfReferenceUID,
        volumeId: volume.volumeId,
        viewPlaneNormal: [1, 0, 0],
        viewUp: [0, 0, 1],
        sliceIndex: 1,
      });

      const patch = harness.setViewState.mock.calls[0][0];

      expect(patch.orientation).toEqual({
        viewPlaneNormal: [1, 0, 0],
        viewUp: [0, 0, 1],
      });
      expect(patch.slice).toEqual({
        kind: 'volumePoint',
        sliceWorldPoint: [0, 0, 1],
      });
    });

    it('flips the target sliceIndex when the requested normal is the exact opposite of the current one', () => {
      const { harness, volume } = createHarness({ numSlices: 5 });

      harness.controller.setViewReference({
        FrameOfReferenceUID: volume.metadata.FrameOfReferenceUID,
        volumeId: volume.volumeId,
        viewPlaneNormal: [0, 0, 1],
        sliceIndex: 1,
      });

      const patch = harness.setViewState.mock.calls[0][0];

      // Opposite normal: no reorientation is recorded (the view direction is
      // considered equivalent), but the slice index is flipped around
      // maxImageIdIndex (4 - 1 = 3) to keep the same physical slice visible.
      expect(patch.orientation).toBeUndefined();
      expect(patch.slice).toEqual({
        kind: 'volumePoint',
        sliceWorldPoint: [0, 0, 3],
      });
    });

    it('derives a compatible orientation from a planeRestriction without reorienting when the plane matches the current normal', () => {
      const { harness, volume } = createHarness();

      harness.controller.setViewReference({
        FrameOfReferenceUID: volume.metadata.FrameOfReferenceUID,
        volumeId: volume.volumeId,
        planeRestriction: {
          FrameOfReferenceUID: volume.metadata.FrameOfReferenceUID,
          point: [0, 0, 1],
          inPlaneVector1: [0, -1, 0],
          inPlaneVector2: [1, 0, 0],
        },
      });

      const patch = harness.setViewState.mock.calls[0][0];

      expect(patch.orientation).toBeUndefined();
      expect(patch.slice).toEqual({
        kind: 'volumePoint',
        sliceWorldPoint: [0, 0, 1],
      });
    });

    it('derives a new orientation from an incompatible planeRestriction via the cross product of its in-plane vectors', () => {
      const { harness, volume } = createHarness();

      harness.controller.setViewReference({
        FrameOfReferenceUID: volume.metadata.FrameOfReferenceUID,
        volumeId: volume.volumeId,
        planeRestriction: {
          FrameOfReferenceUID: volume.metadata.FrameOfReferenceUID,
          point: [0, 0, 0],
          inPlaneVector1: [0, 1, 0],
          inPlaneVector2: [0, 0, 1],
        },
      });

      const patch = harness.setViewState.mock.calls[0][0];

      expect(patch.orientation.viewPlaneNormal[0]).toBeCloseTo(-1, 5);
      expect(patch.orientation.viewPlaneNormal[1]).toBeCloseTo(0, 5);
      expect(patch.orientation.viewPlaneNormal[2]).toBeCloseTo(0, 5);
      expect(patch.orientation.viewUp).toEqual([0, 1, 0]);
      expect(patch.slice).toEqual({
        kind: 'volumePoint',
        sliceWorldPoint: [0, 0, 0],
      });
    });

    it('is a no-op when the reference cannot be resolved to any slice or point', () => {
      const { harness, volume } = createHarness();

      harness.controller.setViewReference({
        FrameOfReferenceUID: volume.metadata.FrameOfReferenceUID,
        volumeId: volume.volumeId,
      });

      expect(harness.setViewState).not.toHaveBeenCalled();
      expect(harness.render).not.toHaveBeenCalled();
    });
  });
});
