jest.mock('../src/metaData', () => ({
  addProvider: jest.fn(),
  get: jest.fn(),
}));

import { vec3 } from 'gl-matrix';
import {
  InterpolationType,
  OrientationAxis,
  VOILUTFunctionType,
} from '../src/enums';
import * as metaData from '../src/metaData';
import {
  createPlanarImageSliceBasis,
  createPlanarCpuImageSliceBasis,
  createPlanarVolumeSliceBasis,
  createPlanarCpuVolumeSliceBasis,
  getVolumeImageIdIndexWorldPoint,
  resolvePlanarVolumeImageIdIndex,
  shouldUsePlanarCpuVolumeSliceBasis,
} from '../src/RenderingEngine/GenericViewport/Planar/planarSliceBasis';

// Mutable per-test override merged into the mocked imagePlaneModule so each
// test can control rowCosines/columnCosines/imagePositionPatient/spacing
// without redefining the whole metaData mock.
let imagePlaneModuleOverrides = {};

function createImage(overrides = {}) {
  return {
    imageId: 'image-1',
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
    ...overrides,
  };
}

// A simple axis-aligned volume: dimensions=[10,8,6], anisotropic spacing
// [0.5,1,2], identity direction, origin offset to [100,200,300] so that
// world coordinates are never confused with index coordinates.
//
// bounds = [xMin,xMax,yMin,yMax,zMin,zMax]
//   x: 100 .. 100 + 9*0.5 = 104.5
//   y: 200 .. 200 + 7*1   = 207
//   z: 300 .. 300 + 5*2   = 310
function createOrthonormalVolume() {
  const dimensions = [10, 8, 6];
  const spacing = [0.5, 1, 2];
  const direction = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const origin = [100, 200, 300];

  return {
    dimensions,
    direction,
    spacing,
    imageData: {
      getDimensions: () => dimensions,
      getDirection: () => direction,
      getExtent: () => [0, 9, 0, 7, 0, 5],
      extentToBounds: () => [
        origin[0],
        origin[0] + 9 * spacing[0],
        origin[1],
        origin[1] + 7 * spacing[1],
        origin[2],
        origin[2] + 5 * spacing[2],
      ],
      // vtkImageData exposes a half-voxel padded spatial extent used by
      // rotateToViewCoordinates (only exercised by the getCubeSizeInView
      // fallback path).
      getSpatialExtent: () => [-0.5, 9.5, -0.5, 7.5, -0.5, 5.5],
      // Supports both the single-arg (returns new array) and the
      // vtk.js-style (ijk, out) mutate-in-place call conventions.
      indexToWorld: (ijk, out) => {
        const world = [
          origin[0] + ijk[0] * spacing[0],
          origin[1] + ijk[1] * spacing[1],
          origin[2] + ijk[2] * spacing[2],
        ];

        if (out) {
          out[0] = world[0];
          out[1] = world[1];
          out[2] = world[2];

          return out;
        }

        return world;
      },
    },
  };
}

// Same geometry as createOrthonormalVolume, but the k axis (scan direction)
// is negated -- a "flipped" volume such as one acquired feet-first.
function createFlippedZVolume() {
  const dimensions = [10, 8, 6];
  const spacing = [0.5, 1, 2];
  const direction = [1, 0, 0, 0, 1, 0, 0, 0, -1];
  const origin = [100, 200, 300];

  return {
    dimensions,
    direction,
    spacing,
    imageData: {
      getDimensions: () => dimensions,
      getDirection: () => direction,
      getExtent: () => [0, 9, 0, 7, 0, 5],
      extentToBounds: () => [
        origin[0],
        origin[0] + 9 * spacing[0],
        origin[1],
        origin[1] + 7 * spacing[1],
        origin[2] - 5 * spacing[2],
        origin[2],
      ],
      indexToWorld: ([i, j, k]) => [
        origin[0] + i * spacing[0],
        origin[1] + j * spacing[1],
        origin[2] - k * spacing[2],
      ],
    },
  };
}

// A single-slice (2D-ish) volume: dimensions=[5,5,1], identity direction,
// unit spacing, origin at [0,0,0].
function createSingleSliceVolume() {
  const dimensions = [5, 5, 1];
  const spacing = [1, 1, 1];
  const direction = [1, 0, 0, 0, 1, 0, 0, 0, 1];

  return {
    dimensions,
    direction,
    spacing,
    imageData: {
      getDimensions: () => dimensions,
      getDirection: () => direction,
      getExtent: () => [0, 4, 0, 4, 0, 0],
      extentToBounds: () => [0, 4, 0, 4, 0, 0],
      indexToWorld: ([i, j, k]) => [i, j, k],
    },
  };
}

// A volume whose row/column axes are rotated 45 degrees in-plane (direction
// matrix is not axis-aligned), while the scan axis (k) stays pure +z. This
// direction matrix fails isOrthonormalDirection's "axis aligned" check, so
// buildImageVolumeCorners must fall back to computing corners via
// indexToWorld instead of extentToBounds -- extentToBounds is made to throw
// so an accidental use of that path fails loudly.
function createRotatedVolume() {
  const dimensions = [4, 4, 4];
  const spacing = [1, 1, 1];
  const c = Math.SQRT1_2;
  const direction = [c, c, 0, -c, c, 0, 0, 0, 1];

  return {
    dimensions,
    direction,
    spacing,
    imageData: {
      getDimensions: () => dimensions,
      getDirection: () => direction,
      getExtent: () => [0, 3, 0, 3, 0, 3],
      extentToBounds: () => {
        throw new Error(
          'extentToBounds should not be used for a non-axis-aligned direction'
        );
      },
      // Half-voxel padded spatial extent, used only by the
      // getCubeSizeInView fallback (rows/columns are rotated relative to the
      // fixed MPR axes, so the fit-metrics computation also falls back here).
      getSpatialExtent: () => [-0.5, 3.5, -0.5, 3.5, -0.5, 3.5],
      indexToWorld: ([i, j, k], out) => {
        const world = [
          i * direction[0] + j * direction[3],
          i * direction[1] + j * direction[4],
          k * direction[8],
        ];

        if (out) {
          out[0] = world[0];
          out[1] = world[1];
          out[2] = world[2];

          return out;
        }

        return world;
      },
    },
  };
}

function expectPoint3Close(actual, expected, precision = 5) {
  expect(actual[0]).toBeCloseTo(expected[0], precision);
  expect(actual[1]).toBeCloseTo(expected[1], precision);
  expect(actual[2]).toBeCloseTo(expected[2], precision);
}

beforeEach(() => {
  jest.clearAllMocks();
  imagePlaneModuleOverrides = {};
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

    if (type === 'scalingModule' || type === 'calibrationModule') {
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
        ...imagePlaneModuleOverrides,
      };
    }
  });
});

describe('createPlanarImageSliceBasis (stack image basis)', () => {
  it('derives the slice basis from row/column cosines and spacing for an axial image', () => {
    imagePlaneModuleOverrides = {
      rowCosines: [1, 0, 0],
      columnCosines: [0, 1, 0],
      imagePositionPatient: [0, 0, 0],
      columnPixelSpacing: 1,
      rowPixelSpacing: 1,
    };

    const image = createImage({
      columns: 4,
      rows: 6,
      columnPixelSpacing: 1,
      rowPixelSpacing: 1,
    });
    const basis = createPlanarImageSliceBasis({
      image,
      canvasWidth: 256,
      canvasHeight: 256,
    });

    // rowVector = rowCosines = [1,0,0]; columnVector = columnCosines = [0,1,0]
    // scanAxisNormal = rowVector x columnVector = [0,0,1]
    // viewPlaneNormal = -scanAxisNormal
    expectPoint3Close(basis.viewPlaneNormal, [0, 0, -1]);
    // viewUp = -columnVector
    expectPoint3Close(basis.viewUp, [0, -1, 0]);
    // rowOffset = ((columns-1)/2)*columnPixelSpacing = (3/2)*1 = 1.5
    // columnOffset = ((rows-1)/2)*rowPixelSpacing = (5/2)*1 = 2.5
    // sliceCenterWorld = origin + rowOffset*rowVector + columnOffset*columnVector
    expectPoint3Close(basis.sliceCenterWorld, [1.5, 2.5, 0]);
    expect(basis.sliceWidthWorld).toBeCloseTo(4, 5);
    expect(basis.sliceHeightWorld).toBeCloseTo(6, 5);
    // physicalHeight = 6, physicalWidth = 4, canvas aspect = 1
    // fitParallelScale = max(6, 4/1) * 0.5 = 3
    expect(basis.fitParallelScale).toBeCloseTo(3, 5);
    expect(basis.cameraDistance).toBe(1);
  });

  it('keeps an orthonormal, correctly-handed basis for an oblique image orientation', () => {
    const cos45 = Math.SQRT1_2;
    const rowCosines = [cos45, cos45, 0];
    const columnCosines = [-cos45, cos45, 0];

    imagePlaneModuleOverrides = {
      rowCosines,
      columnCosines,
      imagePositionPatient: [10, -5, 3],
      columnPixelSpacing: 1,
      rowPixelSpacing: 1,
    };

    const image = createImage({ columns: 8, rows: 8 });
    const basis = createPlanarImageSliceBasis({
      image,
      canvasWidth: 200,
      canvasHeight: 200,
    });

    const rowVec = vec3.fromValues(...rowCosines);
    const colVec = vec3.fromValues(...columnCosines);
    const expectedNormal = Array.from(
      vec3.negate(vec3.create(), vec3.cross(vec3.create(), rowVec, colVec))
    );
    const expectedViewUp = Array.from(vec3.negate(vec3.create(), colVec));

    expectPoint3Close(basis.viewPlaneNormal, expectedNormal);
    expectPoint3Close(basis.viewUp, expectedViewUp);

    // orthonormality: unit length, mutually perpendicular
    expect(vec3.length(basis.viewPlaneNormal)).toBeCloseTo(1, 6);
    expect(vec3.length(basis.viewUp)).toBeCloseTo(1, 6);
    expect(vec3.dot(basis.viewPlaneNormal, basis.viewUp)).toBeCloseTo(0, 6);

    // handedness: rowVector x columnVector must point opposite viewPlaneNormal
    // (viewPlaneNormal is defined as the negated cross product), i.e. rowVector,
    // columnVector, -viewPlaneNormal form a right-handed triple.
    const crossRowCol = vec3.cross(vec3.create(), rowVec, colVec);

    expectPoint3Close(
      Array.from(vec3.negate(vec3.create(), crossRowCol)),
      basis.viewPlaneNormal
    );
  });

  it('handles a single-row image without collapsing the column offset incorrectly', () => {
    imagePlaneModuleOverrides = {
      rowCosines: [1, 0, 0],
      columnCosines: [0, 1, 0],
      imagePositionPatient: [0, 0, 0],
    };

    const image = createImage({ columns: 5, rows: 1 });
    const basis = createPlanarImageSliceBasis({
      image,
      canvasWidth: 100,
      canvasHeight: 100,
    });

    // columnOffset = ((rows-1)/2)*rowPixelSpacing = 0
    // rowOffset = ((columns-1)/2)*columnPixelSpacing = 2
    expectPoint3Close(basis.sliceCenterWorld, [2, 0, 0]);
    expect(basis.sliceHeightWorld).toBeCloseTo(1, 5);
  });

  it('produces an identical basis for the CPU and VTK stack image paths', () => {
    imagePlaneModuleOverrides = {
      rowCosines: [1, 0, 0],
      columnCosines: [0, 1, 0],
      imagePositionPatient: [2, 3, 4],
      columnPixelSpacing: 0.5,
      rowPixelSpacing: 0.75,
    };

    const image = createImage({
      columns: 10,
      rows: 12,
      columnPixelSpacing: 0.5,
      rowPixelSpacing: 0.75,
    });
    const args = { image, canvasWidth: 320, canvasHeight: 240 };

    // createPlanarCpuImageSliceBasis is documented to simply delegate to
    // createPlanarImageSliceBasis so stack rendering is invariant across
    // render modes -- assert that relationship holds (value equality).
    expect(createPlanarCpuImageSliceBasis(args)).toEqual(
      createPlanarImageSliceBasis(args)
    );
  });
});

describe('createPlanarVolumeSliceBasis (volume slice basis)', () => {
  it('derives an axial volume slice basis with the geometric center as the default slice', () => {
    const imageVolume = createOrthonormalVolume();
    const { sliceBasis, currentImageIdIndex, maxImageIdIndex } =
      createPlanarVolumeSliceBasis({
        canvasWidth: 256,
        canvasHeight: 256,
        imageVolume,
        orientation: OrientationAxis.AXIAL,
      });

    expectPoint3Close(sliceBasis.viewPlaneNormal, [0, 0, -1]);
    expectPoint3Close(sliceBasis.viewUp, [0, -1, 0]);
    // getVolumeCenterIJK snaps the axis aligned with viewPlaneNormal (k, dim=6)
    // to floor(6/2)=3, the other two axes use (d-1)/2: ijk=[4.5, 3.5, 3]
    // world = origin + ijk*spacing = [100+2.25, 200+3.5, 300+6] = [102.25, 203.5, 306]
    expectPoint3Close(sliceBasis.sliceCenterWorld, [102.25, 203.5, 306]);
    // dims[2]-1 = 5 slices available along the normal
    expect(maxImageIdIndex).toBe(5);
    // viewPlaneNormal is -z, so index 0 <-> z=310 (max k) and index 5 <-> z=300
    // (min k); the geometric center (k=3, z=306) falls 4/10 of the way from
    // min(z=310) to max(z=300), i.e. floatingIndex = 0.4*5 = 2.
    expect(currentImageIdIndex).toBe(2);
  });

  it.each([
    [0, 310],
    [5, 300],
    [-3, 310], // clamps below 0 to index 0
    [100, 300], // clamps above maxImageIdIndex (5) to index 5
  ])(
    'positions the axial slice center at the requested index %i (clamped to [0,5])',
    (requestedIndex, expectedZ) => {
      const imageVolume = createOrthonormalVolume();
      const { sliceBasis, currentImageIdIndex } = createPlanarVolumeSliceBasis({
        canvasWidth: 256,
        canvasHeight: 256,
        imageVolume,
        orientation: OrientationAxis.AXIAL,
        imageIdIndex: requestedIndex,
      });
      const expectedIndex = Math.min(Math.max(requestedIndex, 0), 5);

      expect(currentImageIdIndex).toBe(expectedIndex);
      expectPoint3Close(sliceBasis.sliceCenterWorld, [
        102.25,
        203.5,
        expectedZ,
      ]);
    }
  );

  it('computes fit metrics for the axial orientation from the projected in-plane axes', () => {
    const imageVolume = createOrthonormalVolume();
    const { sliceBasis } = createPlanarVolumeSliceBasis({
      canvasWidth: 256,
      canvasHeight: 256,
      imageVolume,
      orientation: OrientationAxis.AXIAL,
    });

    // For AXIAL, the in-plane axes are x (columns=10, spacing 0.5) and
    // y (rows=8, spacing 1): sliceWidthWorld = 10*0.5 = 5, sliceHeightWorld = 8*1 = 8
    expect(sliceBasis.sliceWidthWorld).toBeCloseTo(5, 5);
    expect(sliceBasis.sliceHeightWorld).toBeCloseTo(8, 5);
    // physicalHeight=8, physicalWidth/aspect=5/1=5 -> fitParallelScale=max(8,5)*0.5=4
    expect(sliceBasis.fitParallelScale).toBeCloseTo(4, 5);
  });

  it('derives a sagittal volume slice basis with a direct index-to-depth mapping', () => {
    const imageVolume = createOrthonormalVolume();
    const { sliceBasis, currentImageIdIndex, maxImageIdIndex } =
      createPlanarVolumeSliceBasis({
        canvasWidth: 256,
        canvasHeight: 256,
        imageVolume,
        orientation: OrientationAxis.SAGITTAL,
      });

    expectPoint3Close(sliceBasis.viewPlaneNormal, [1, 0, 0]);
    expectPoint3Close(sliceBasis.viewUp, [0, 0, 1]);
    // sliceAxis snaps to i (dim=10): ijk=[floor(10/2)=5, (8-1)/2=3.5, (6-1)/2=2.5]
    // world = [100+2.5, 203.5, 305] = [102.5, 203.5, 305]
    expectPoint3Close(sliceBasis.sliceCenterWorld, [102.5, 203.5, 305]);
    expect(maxImageIdIndex).toBe(9);
    // viewPlaneNormal is +x here, so index maps directly to i (no inversion);
    // i=5 out of [0,9] -> currentImageIdIndex = 5.
    expect(currentImageIdIndex).toBe(5);
  });

  it.each([
    [0, 100],
    [9, 104.5],
  ])(
    'positions the sagittal slice center at the requested index %i',
    (requestedIndex, expectedX) => {
      const imageVolume = createOrthonormalVolume();
      const { sliceBasis } = createPlanarVolumeSliceBasis({
        canvasWidth: 256,
        canvasHeight: 256,
        imageVolume,
        orientation: OrientationAxis.SAGITTAL,
        imageIdIndex: requestedIndex,
      });

      expectPoint3Close(sliceBasis.sliceCenterWorld, [expectedX, 203.5, 305]);
    }
  );

  it('derives a coronal volume slice basis with an inverted index-to-depth mapping', () => {
    const imageVolume = createOrthonormalVolume();
    const { sliceBasis, currentImageIdIndex, maxImageIdIndex } =
      createPlanarVolumeSliceBasis({
        canvasWidth: 256,
        canvasHeight: 256,
        imageVolume,
        orientation: OrientationAxis.CORONAL,
      });

    expectPoint3Close(sliceBasis.viewPlaneNormal, [0, -1, 0]);
    expectPoint3Close(sliceBasis.viewUp, [0, 0, 1]);
    // sliceAxis snaps to j (dim=8): ijk=[(10-1)/2=4.5, floor(8/2)=4, (6-1)/2=2.5]
    // world = [102.25, 204, 305]
    expectPoint3Close(sliceBasis.sliceCenterWorld, [102.25, 204, 305]);
    expect(maxImageIdIndex).toBe(7);
    // viewPlaneNormal is -y, so mapping inverts like the AXIAL case:
    // j=4 out of [0,7] centered -> currentImageIdIndex = 3.
    expect(currentImageIdIndex).toBe(3);
  });

  it('honors an explicit volumePoint slice request over the geometric center', () => {
    const imageVolume = createOrthonormalVolume();
    const { sliceBasis } = createPlanarVolumeSliceBasis({
      canvasWidth: 256,
      canvasHeight: 256,
      imageVolume,
      orientation: OrientationAxis.AXIAL,
      viewState: {
        orientation: OrientationAxis.AXIAL,
        slice: {
          kind: 'volumePoint',
          sliceWorldPoint: [104.5, 207, 310],
        },
      },
    });

    // Only the requested point's projection onto viewPlaneNormal ([0,0,-1])
    // matters, so only the z coordinate is honored; x/y stay at the volume's
    // geometric center (102.25, 203.5) computed for the AXIAL orientation.
    expectPoint3Close(sliceBasis.sliceCenterWorld, [102.25, 203.5, 310]);
  });

  it('returns a fallback slice basis when no orientation can be resolved', () => {
    const imageVolume = createOrthonormalVolume();
    const { sliceBasis, currentImageIdIndex, maxImageIdIndex } =
      createPlanarVolumeSliceBasis({
        canvasWidth: 256,
        canvasHeight: 256,
        imageVolume,
      });

    expectPoint3Close(sliceBasis.sliceCenterWorld, [0, 0, 0]);
    expectPoint3Close(sliceBasis.viewPlaneNormal, [0, 0, 1]);
    expectPoint3Close(sliceBasis.viewUp, [0, -1, 0]);
    expect(sliceBasis.fitParallelScale).toBe(1);
    expect(sliceBasis.sliceWidthWorld).toBe(2);
    expect(sliceBasis.sliceHeightWorld).toBe(2);
    expect(sliceBasis.cameraDistance).toBe(1);
    expect(currentImageIdIndex).toBe(0);
    expect(maxImageIdIndex).toBe(0);
  });

  it('falls back to the origin center when the volume has no vtkImageData', () => {
    const imageVolume = {
      dimensions: [10, 8, 6],
      direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      spacing: [0.5, 1, 2],
    };
    const { sliceBasis, currentImageIdIndex, maxImageIdIndex } =
      createPlanarVolumeSliceBasis({
        canvasWidth: 256,
        canvasHeight: 256,
        imageVolume,
        orientation: OrientationAxis.AXIAL,
      });

    expectPoint3Close(sliceBasis.sliceCenterWorld, [0, 0, 0]);
    expect(currentImageIdIndex).toBe(0);
    expect(maxImageIdIndex).toBe(0);
    // With no corners to project, min=max=0; cameraDistance falls back to
    // max(0, spacingInNormalDirection, 1) = max(0, 2, 1) = 2.
    expect(sliceBasis.cameraDistance).toBeCloseTo(2, 5);
  });

  it('clamps to a single slice for a one-slice-thick volume', () => {
    const imageVolume = createSingleSliceVolume();
    const { sliceBasis, currentImageIdIndex, maxImageIdIndex } =
      createPlanarVolumeSliceBasis({
        canvasWidth: 256,
        canvasHeight: 256,
        imageVolume,
        orientation: OrientationAxis.AXIAL,
        imageIdIndex: 7,
      });

    expect(maxImageIdIndex).toBe(0);
    expect(currentImageIdIndex).toBe(0);
    // ijk=[(5-1)/2=2, (5-1)/2=2, floor(1/2)=0] -> world=[2,2,0]
    expectPoint3Close(sliceBasis.sliceCenterWorld, [2, 2, 0]);
  });

  it('derives volume geometry from indexToWorld corners when the direction matrix is not axis-aligned', () => {
    const imageVolume = createRotatedVolume();
    const { sliceBasis, currentImageIdIndex, maxImageIdIndex } =
      createPlanarVolumeSliceBasis({
        canvasWidth: 256,
        canvasHeight: 256,
        imageVolume,
        orientation: OrientationAxis.AXIAL,
      });

    // scanAxis (k) is still pure +z, so it aligns with the AXIAL normal
    // ([0,0,-1]) even though rows/columns are rotated 45 degrees in-plane.
    expect(maxImageIdIndex).toBe(3);
    // ijk=[(4-1)/2=1.5, 1.5, floor(4/2)=2]
    // x = 1.5*cos45 + 1.5*(-cos45) = 0
    // y = 1.5*cos45 + 1.5*cos45 = 1.5*sqrt(2)
    // z = 2
    expectPoint3Close(sliceBasis.sliceCenterWorld, [0, 1.5 * Math.SQRT2, 2]);
    // z corners are 0 (k=0) and 3 (k=3); projected onto normal [0,0,-1] gives
    // min=-3 (k=3), max=0 (k=0); center k=2 -> fraction=(-2-(-3))/3=1/3 -> index=1
    expect(currentImageIdIndex).toBe(1);
  });

  it('resolves correct slice depths for a volume with a flipped (negative) direction axis', () => {
    const imageVolume = createFlippedZVolume();
    const { sliceBasis, currentImageIdIndex, maxImageIdIndex } =
      createPlanarVolumeSliceBasis({
        canvasWidth: 256,
        canvasHeight: 256,
        imageVolume,
        orientation: OrientationAxis.AXIAL,
      });

    expect(maxImageIdIndex).toBe(5);
    // getVolumeCenterIJK uses abs(dot(...)) for alignment, so the flipped k
    // axis still snaps: ijk=[4.5, 3.5, floor(6/2)=3]
    // world z = origin_z - k*spacing_z = 300 - 3*2 = 294
    expectPoint3Close(sliceBasis.sliceCenterWorld, [102.25, 203.5, 294]);
    // Both the direction (k axis) and the viewPlaneNormal are negative in z,
    // so the two sign flips cancel out and the index-to-k mapping is direct.
    expect(currentImageIdIndex).toBe(3);
  });

  it.each([
    [0, 300],
    [5, 290],
  ])(
    'maps flipped-volume index %i to the correct world depth',
    (requestedIndex, expectedZ) => {
      const imageVolume = createFlippedZVolume();
      const { sliceBasis } = createPlanarVolumeSliceBasis({
        canvasWidth: 256,
        canvasHeight: 256,
        imageVolume,
        orientation: OrientationAxis.AXIAL,
        imageIdIndex: requestedIndex,
      });

      expectPoint3Close(sliceBasis.sliceCenterWorld, [
        102.25,
        203.5,
        expectedZ,
      ]);
    }
  );

  it('derives ACQUISITION orientation vectors from the volume direction, not fixed MPR axes', () => {
    const imageVolume = createRotatedVolume();
    const { sliceBasis } = createPlanarVolumeSliceBasis({
      canvasWidth: 256,
      canvasHeight: 256,
      imageVolume,
      orientation: OrientationAxis.ACQUISITION,
    });
    const c = Math.SQRT1_2;

    // getAcquisitionPlaneOrientation: viewPlaneNormal = -scanAxis = [0,0,-1]
    // (same as fixed AXIAL here because scanAxis happens to be pure z), but
    // viewUp = -columnCosines = -[-c, c, 0] = [c, -c, 0], which differs from
    // the fixed MPR axial viewUp of [0, -1, 0].
    expectPoint3Close(sliceBasis.viewPlaneNormal, [0, 0, -1]);
    expectPoint3Close(sliceBasis.viewUp, [c, -c, 0]);
  });

  it('accepts explicit orientation vectors, bypassing the MPR/ACQUISITION presets', () => {
    const imageVolume = createOrthonormalVolume();
    const customNormal = [0, 0.6, 0.8];
    const customUp = [0, 0.8, -0.6];
    const { sliceBasis } = createPlanarVolumeSliceBasis({
      canvasWidth: 256,
      canvasHeight: 256,
      imageVolume,
      orientation: { viewPlaneNormal: customNormal, viewUp: customUp },
    });

    expectPoint3Close(sliceBasis.viewPlaneNormal, customNormal);
    expectPoint3Close(sliceBasis.viewUp, customUp);
  });

  it('falls back to the acquisition viewUp when explicit orientation vectors omit it', () => {
    const imageVolume = createOrthonormalVolume();
    const { sliceBasis } = createPlanarVolumeSliceBasis({
      canvasWidth: 256,
      canvasHeight: 256,
      imageVolume,
      orientation: { viewPlaneNormal: [0, 0, -1] },
    });

    // Acquisition viewUp = -columnCosines(direction) = -[0,1,0] = [0,-1,0]
    expectPoint3Close(sliceBasis.viewUp, [0, -1, 0]);
  });

  it('falls back to the rotated bounding-box cube size when orientation axes are not aligned to any volume axis', () => {
    const imageVolume = createOrthonormalVolume();
    const sqrt2 = Math.SQRT2;
    const sqrt3 = Math.sqrt(3);
    const sqrt6 = Math.sqrt(6);
    const viewPlaneNormal = [1 / sqrt3, 1 / sqrt3, 1 / sqrt3];
    const viewUp = [1 / sqrt2, -1 / sqrt2, 0];

    const { sliceBasis } = createPlanarVolumeSliceBasis({
      canvasWidth: 256,
      canvasHeight: 256,
      imageVolume,
      orientation: { viewPlaneNormal, viewUp },
    });

    // viewRight = normalize(cross(viewPlaneNormal, viewUp)) = (1,1,-2)/sqrt(6).
    // None of viewRight/viewUp/viewPlaneNormal is >= 0.995-aligned with a
    // volume axis, so getOrthogonalVolumeSliceGeometry bails out and the fit
    // falls back to the rotated bounding-box support size (getCubeSizeInView).
    //
    // For a linear functional f(index) = dot(origin + spacing*index, v) over
    // an axis-aligned index-space box, max-min per axis is
    // |spacing_i * v_i| * indexRange_i. Index ranges from the half-voxel
    // padded spatial extent: x=10, y=8, z=6.
    const expectedWidth =
      0.5 * (1 / sqrt6) * 10 + 1 * (1 / sqrt6) * 8 + 2 * (2 / sqrt6) * 6;
    const expectedHeight = 0.5 * (1 / sqrt2) * 10 + 1 * (1 / sqrt2) * 8;

    expect(sliceBasis.sliceWidthWorld).toBeCloseTo(expectedWidth, 4);
    expect(sliceBasis.sliceHeightWorld).toBeCloseTo(expectedHeight, 4);
    // widthWorld > heightWorld with a square canvas, so fitParallelScale = widthWorld/2
    expect(sliceBasis.fitParallelScale).toBeCloseTo(expectedWidth / 2, 4);
  });

  it('falls back to nominal fit metrics when neither an axis-aligned geometry nor a bounding-box cube size can be computed', () => {
    const imageVolume = {
      dimensions: [10, 8, 6],
      direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      spacing: [0.5, 1, 2],
      // No imageData, so getCubeSizeInView's imageData-dependent branch is
      // also unavailable -- combined with a non-axis-aligned orientation
      // (getOrthogonalVolumeSliceGeometry returns undefined), this forces
      // getCpuVolumeSliceFitMetrics all the way to createFallbackVolumeSliceFitMetrics.
    };
    const sqrt2 = Math.SQRT2;
    const sqrt3 = Math.sqrt(3);

    const { sliceBasis } = createPlanarVolumeSliceBasis({
      canvasWidth: 256,
      canvasHeight: 256,
      imageVolume,
      orientation: {
        viewPlaneNormal: [1 / sqrt3, 1 / sqrt3, 1 / sqrt3],
        viewUp: [1 / sqrt2, -1 / sqrt2, 0],
      },
    });

    expect(sliceBasis.fitParallelScale).toBe(1);
    expect(sliceBasis.sliceWidthWorld).toBe(2);
    expect(sliceBasis.sliceHeightWorld).toBe(2);
  });

  it('produces an identical basis for the CPU and VTK volume slice paths', () => {
    const imageVolume = createOrthonormalVolume();
    const args = {
      canvasWidth: 256,
      canvasHeight: 256,
      imageVolume,
      orientation: OrientationAxis.CORONAL,
    };

    // createPlanarCpuVolumeSliceBasis is documented to delegate directly to
    // createPlanarVolumeSliceBasis.
    expect(createPlanarCpuVolumeSliceBasis(args)).toEqual(
      createPlanarVolumeSliceBasis(args)
    );
  });
});

describe('resolvePlanarVolumeImageIdIndex', () => {
  it('returns undefined for a volumePoint slice regardless of fallback', () => {
    expect(
      resolvePlanarVolumeImageIdIndex({
        viewState: {
          slice: { kind: 'volumePoint', sliceWorldPoint: [0, 0, 0] },
        },
        fallbackImageIdIndex: 4,
      })
    ).toBeUndefined();
  });

  it('returns the explicit index for a stackIndex slice', () => {
    expect(
      resolvePlanarVolumeImageIdIndex({
        viewState: { slice: { kind: 'stackIndex', imageIdIndex: 9 } },
        fallbackImageIdIndex: 4,
      })
    ).toBe(9);
  });

  it('does not clamp an out-of-range stackIndex slice', () => {
    // resolvePlanarVolumeImageIdIndex has no knowledge of the volume's slice
    // count (it never receives the volume or imageIds), so clamping happens
    // downstream in clampImageIdIndex/buildPlanarVolumeSliceBasis, not here.
    expect(
      resolvePlanarVolumeImageIdIndex({
        viewState: { slice: { kind: 'stackIndex', imageIdIndex: 999 } },
      })
    ).toBe(999);
  });

  it('falls back to fallbackImageIdIndex for ACQUISITION orientation without an explicit slice', () => {
    expect(
      resolvePlanarVolumeImageIdIndex({
        viewState: { orientation: OrientationAxis.ACQUISITION },
        fallbackImageIdIndex: 7,
      })
    ).toBe(7);
  });

  it('returns undefined for a non-acquisition orientation without an explicit slice', () => {
    expect(
      resolvePlanarVolumeImageIdIndex({
        viewState: { orientation: OrientationAxis.AXIAL },
        fallbackImageIdIndex: 7,
      })
    ).toBeUndefined();
  });

  it('returns undefined when neither a slice nor a viewState is provided', () => {
    expect(resolvePlanarVolumeImageIdIndex({})).toBeUndefined();
  });
});

describe('getVolumeImageIdIndexWorldPoint', () => {
  it('maps a flattened dynamic-volume index to its group-local slice', () => {
    // A 4D volume flattens its imageIds across dimension groups (here 3
    // groups of 6 slices) while dimensions[2] stays the per-group slice
    // count, and exposes the flat -> group-local mapping.
    const volume = createOrthonormalVolume();

    volume.flatImageIdIndexToImageIdIndex = (flatImageIdIndex) =>
      flatImageIdIndex % 6;

    // Flattened index 14 = group 3, local slice 2 — NOT the last slice (5)
    // that a raw clamp against dimensions[2] - 1 would produce.
    expectPoint3Close(
      getVolumeImageIdIndexWorldPoint(volume, 14),
      [102.25, 203.5, 304]
    );
    // Indices inside the first group pass through the mapping unchanged.
    expectPoint3Close(
      getVolumeImageIdIndexWorldPoint(volume, 2),
      [102.25, 203.5, 304]
    );
  });

  it('returns the exact IJK slice center for an imageId-list index', () => {
    const volume = createOrthonormalVolume();

    // imageIds[2] is IJK slice 2: indexToWorld([4.5, 3.5, 2]).
    expectPoint3Close(
      getVolumeImageIdIndexWorldPoint(volume, 2),
      [102.25, 203.5, 304]
    );
  });

  it('follows the k axis wherever it points (flipped-Z volume)', () => {
    const volume = createFlippedZVolume();

    // The k axis is negated, so slice 2 sits BELOW the origin — the point
    // tracks the volume geometry, not a world-axis or camera direction.
    expectPoint3Close(
      getVolumeImageIdIndexWorldPoint(volume, 2),
      [102.25, 203.5, 296]
    );
  });

  it('clamps the index to the volume k range', () => {
    const volume = createOrthonormalVolume();

    expectPoint3Close(
      getVolumeImageIdIndexWorldPoint(volume, 99),
      [102.25, 203.5, 310]
    );
    expectPoint3Close(
      getVolumeImageIdIndexWorldPoint(volume, -3),
      [102.25, 203.5, 300]
    );
  });

  it('returns undefined without vtkImageData', () => {
    expect(
      getVolumeImageIdIndexWorldPoint({ imageData: undefined }, 1)
    ).toBeUndefined();
    expect(getVolumeImageIdIndexWorldPoint(undefined, 1)).toBeUndefined();
  });
});

describe('shouldUsePlanarCpuVolumeSliceBasis', () => {
  it('selects the CPU basis only for nearest-neighbor interpolation', () => {
    expect(shouldUsePlanarCpuVolumeSliceBasis(InterpolationType.NEAREST)).toBe(
      true
    );
  });

  it('selects the VTK basis for linear interpolation', () => {
    expect(shouldUsePlanarCpuVolumeSliceBasis(InterpolationType.LINEAR)).toBe(
      false
    );
  });

  it('defaults to the VTK basis when no interpolation type is provided', () => {
    expect(shouldUsePlanarCpuVolumeSliceBasis()).toBe(false);
  });
});
