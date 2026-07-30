// Covers packages/tools/src/utilities/planar/ and src/utilities/boundingBox/
// (all ~0% coverage). These are pure-geometry helpers used to decide which
// annotations render on a given slice/plane and to compute pixel/index
// bounding boxes for segmentation strategies.
//
// EPSILON below matches the real @cornerstonejs/core CONSTANTS.EPSILON
// (packages/core/src/constants/epsilon.ts -> 1e-3), which several of these
// modules use as a parallel-normal / clip tolerance.
const EPSILON = 1e-3;

jest.mock('@cornerstonejs/core', () => {
  class StackViewport {}
  class VolumeViewport {}

  return {
    CONSTANTS: { EPSILON: 1e-3 },
    metaData: { get: jest.fn() },
    utilities: {
      // Minimal re-implementation of the real isEqual (numbers only), see
      // packages/utils/src/utilities/math/isEqual.ts.
      isEqual: (v1, v2, tolerance = 1e-5) => Math.abs(v1 - v2) <= tolerance,
      getViewportContentMode: jest.fn(),
      getTargetVolumeAndSpacingInNormalDir: jest.fn(),
    },
    StackViewport,
    VolumeViewport,
  };
});

// filterAnnotationsForDisplay's native-volume branch calls getViewportICamera
// to bridge a resolved-view viewport into an ICamera-shaped object. That
// bridging logic (isGenericViewport / clonePoint3 / getResolvedView) is
// outside the scope of this filter, so we stub it directly.
jest.mock('../../src/utilities/getViewportICamera', () => ({
  __esModule: true,
  default: jest.fn(),
}));

import { metaData, utilities as csUtils } from '@cornerstonejs/core';
import { StackViewport, VolumeViewport } from '@cornerstonejs/core';
import getViewportICamera from '../../src/utilities/getViewportICamera';

import filterAnnotationsWithinSlice from '../../src/utilities/planar/filterAnnotationsWithinSlice';
import { filterAnnotationsWithinSamePlane } from '../../src/utilities/planar/filterAnnotationsWithinPlane';
import filterAnnotationsForDisplay from '../../src/utilities/planar/filterAnnotationsForDisplay';
import getWorldWidthAndHeightFromCorners from '../../src/utilities/planar/getWorldWidthAndHeightFromCorners';
import getWorldWidthAndHeightFromTwoPoints from '../../src/utilities/planar/getWorldWidthAndHeightFromTwoPoints';
import { isPlaneIntersectingAABB } from '../../src/utilities/planar/isPlaneIntersectingAABB';
import {
  getPointInLineOfSightWithCriteria,
  getPointsInLineOfSight,
} from '../../src/utilities/planar/getPointInLineOfSightWithCriteria';

import {
  getBoundingBoxAroundShapeIJK,
  getBoundingBoxAroundShapeWorld,
} from '../../src/utilities/boundingBox/getBoundingBoxAroundShape';
import extend2DBoundingBoxInViewAxis from '../../src/utilities/boundingBox/extend2DBoundingBoxInViewAxis';
import snapIndexBounds from '../../src/utilities/boundingBox/snapIndexBounds';

function makeAnnotation({
  viewPlaneNormal,
  referencedImageId,
  FrameOfReferenceUID,
  planeRestriction,
  points,
  contourPoints,
  isVisible = true,
  isCanvasAnnotation = false,
} = {}) {
  return {
    isVisible,
    metadata: {
      viewPlaneNormal,
      referencedImageId,
      FrameOfReferenceUID,
      planeRestriction,
    },
    data: {
      isCanvasAnnotation,
      handles: points ? { points } : undefined,
      contour: contourPoints ? { polyline: contourPoints } : undefined,
    },
  };
}

describe('utilities/planar/filterAnnotationsWithinSlice', () => {
  const camera = {
    focalPoint: [0, 0, 0],
    viewPlaneNormal: [0, 0, 1],
  };
  const spacingInNormalDirection = 2; // halfSpacing = 1

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps an annotation with a parallel normal within half the slice spacing', () => {
    const annotation = makeAnnotation({
      viewPlaneNormal: [0, 0, 1],
      points: [[0, 0, 0.5]], // distance to focal point along normal = 0.5 < 1
    });

    const result = filterAnnotationsWithinSlice(
      [annotation],
      camera,
      spacingInNormalDirection
    );

    expect(result).toEqual([annotation]);
  });

  it('excludes an annotation with a parallel normal but outside the slice spacing', () => {
    const annotation = makeAnnotation({
      viewPlaneNormal: [0, 0, 1],
      points: [[0, 0, 5]], // distance = 5, not < halfSpacing (1)
    });

    const result = filterAnnotationsWithinSlice(
      [annotation],
      camera,
      spacingInNormalDirection
    );

    expect(result).toEqual([]);
  });

  it('treats an antiparallel normal as parallel (flip-safe by design)', () => {
    // dot([0,0,1],[0,0,-1]) = -1, abs(-1) = 1 > PARALLEL_THRESHOLD (0.999)
    // The source comments explain this is intentional: camera flips should
    // not hide annotations on the same physical slice.
    const annotation = makeAnnotation({
      viewPlaneNormal: [0, 0, -1],
      points: [[0, 0, 0]],
    });

    const result = filterAnnotationsWithinSlice(
      [annotation],
      camera,
      spacingInNormalDirection
    );

    expect(result).toEqual([annotation]);
  });

  it('excludes an annotation whose normal is perpendicular to the camera normal', () => {
    // dot([0,0,1],[1,0,0]) = 0, not > 0.999 -> not parallel, regardless of
    // distance.
    const annotation = makeAnnotation({
      viewPlaneNormal: [1, 0, 0],
      points: [[0, 0, 0]],
    });

    const result = filterAnnotationsWithinSlice(
      [annotation],
      camera,
      spacingInNormalDirection
    );

    expect(result).toEqual([]);
  });

  it('excludes invisible annotations even if otherwise in-slice', () => {
    const annotation = makeAnnotation({
      viewPlaneNormal: [0, 0, 1],
      points: [[0, 0, 0]],
      isVisible: false,
    });

    const result = filterAnnotationsWithinSlice(
      [annotation],
      camera,
      spacingInNormalDirection
    );

    expect(result).toEqual([]);
  });

  it('includes an annotation with no handle/contour points unconditionally (e.g. key images)', () => {
    const annotation = makeAnnotation({
      viewPlaneNormal: [0, 0, 1],
    });

    const result = filterAnnotationsWithinSlice(
      [annotation],
      camera,
      spacingInNormalDirection
    );

    expect(result).toEqual([annotation]);
  });

  it('reads the first contour polyline point when handles are absent', () => {
    const annotation = makeAnnotation({
      viewPlaneNormal: [0, 0, 1],
      contourPoints: [[0, 0, 5]], // outside half-spacing (1)
    });

    const result = filterAnnotationsWithinSlice(
      [annotation],
      camera,
      spacingInNormalDirection
    );

    expect(result).toEqual([]);
  });

  it('planeRestriction: keeps annotation when both in-plane vectors are perpendicular to the camera normal', () => {
    const annotation = makeAnnotation({
      planeRestriction: {
        inPlaneVector1: [1, 0, 0],
        inPlaneVector2: [0, 1, 0],
        point: [0, 0, 0],
      },
    });

    const result = filterAnnotationsWithinSlice(
      [annotation],
      camera,
      spacingInNormalDirection
    );

    expect(result).toEqual([annotation]);
  });

  it('planeRestriction: excludes annotation when an in-plane vector is parallel to the camera normal', () => {
    const annotation = makeAnnotation({
      planeRestriction: {
        inPlaneVector1: [0, 0, 1], // parallel to camera normal -> restriction violated
        inPlaneVector2: [0, 1, 0],
        point: [0, 0, 0],
      },
    });

    const result = filterAnnotationsWithinSlice(
      [annotation],
      camera,
      spacingInNormalDirection
    );

    expect(result).toEqual([]);
  });

  it('derives the normal from FrameOfReferenceUID + handle points lying on the camera plane', () => {
    // No referencedImageId/viewPlaneNormal, but all handle points are
    // coplanar with the focal point w.r.t. the camera normal (dot === 0),
    // so the annotation is accepted and stamped with the camera's normal.
    const annotation = makeAnnotation({
      FrameOfReferenceUID: 'for-1',
      points: [[5, 5, 0]],
    });

    const result = filterAnnotationsWithinSlice(
      [annotation],
      camera,
      spacingInNormalDirection
    );

    expect(result).toEqual([annotation]);
    expect(annotation.metadata.viewPlaneNormal).toEqual(camera.viewPlaneNormal);
  });

  it('derives the normal from imagePlaneModule metadata when referencedImageId is present', () => {
    // Identity-like orientation: row cosine = X axis, column cosine = Y axis
    // -> cross(row, col) = [0,0,1], which matches the camera normal exactly.
    metaData.get.mockReturnValue({
      imageOrientationPatient: [1, 0, 0, 0, 1, 0],
    });
    const annotation = makeAnnotation({
      referencedImageId: 'image:1',
      points: [[0, 0, 0]],
    });

    const result = filterAnnotationsWithinSlice(
      [annotation],
      camera,
      spacingInNormalDirection
    );

    expect(result).toEqual([annotation]);
    expect(metaData.get).toHaveBeenCalledWith('imagePlaneModule', 'image:1');
  });

  it('returns an empty array up-front when nothing has a parallel normal', () => {
    const annotation = makeAnnotation({
      viewPlaneNormal: [1, 0, 0],
    });

    const result = filterAnnotationsWithinSlice([annotation], camera, 2);

    expect(result).toEqual([]);
  });
});

describe('utilities/planar/filterAnnotationsWithinPlane (filterAnnotationsWithinSamePlane)', () => {
  const camera = {
    focalPoint: [0, 0, 0],
    viewPlaneNormal: [0, 0, 1],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps annotations whose stored normal is parallel to the camera normal', () => {
    const annotation = makeAnnotation({ viewPlaneNormal: [0, 0, 1] });

    const result = filterAnnotationsWithinSamePlane([annotation], camera);

    expect(result).toEqual([annotation]);
  });

  it('excludes annotations whose stored normal is not parallel', () => {
    const annotation = makeAnnotation({ viewPlaneNormal: [0, 1, 0] });

    const result = filterAnnotationsWithinSamePlane([annotation], camera);

    expect(result).toEqual([]);
  });

  it('derives the normal from imagePlaneModule metadata when missing, then keeps parallel matches', () => {
    metaData.get.mockReturnValue({
      imageOrientationPatient: [1, 0, 0, 0, 1, 0],
    });
    const annotation = makeAnnotation({ referencedImageId: 'image:1' });

    const result = filterAnnotationsWithinSamePlane([annotation], camera);

    expect(result).toEqual([annotation]);
    // vec3.cross returns a Float32Array; compare contents via Array.from
    // rather than relying on toEqual's typed-array/array type matching.
    expect(Array.from(annotation.metadata.viewPlaneNormal)).toEqual([0, 0, 1]);
  });

  it('returns an empty array when no annotation matches', () => {
    const annotation = makeAnnotation({ viewPlaneNormal: [1, 0, 0] });

    const result = filterAnnotationsWithinSamePlane([annotation], camera);

    expect(result).toEqual([]);
  });
});

describe('utilities/planar/filterAnnotationsForDisplay', () => {
  const camera = {
    focalPoint: [0, 0, 0],
    viewPlaneNormal: [0, 0, 1],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('legacy VolumeViewport: delegates to filterAnnotationsWithinSlice using getCamera()', () => {
    const inSlice = makeAnnotation({
      viewPlaneNormal: [0, 0, 1],
      points: [[0, 0, 0.2]],
    });
    const outOfSlice = makeAnnotation({
      viewPlaneNormal: [0, 0, 1],
      points: [[0, 0, 5]],
    });
    const viewport = Object.assign(Object.create(VolumeViewport.prototype), {
      getCamera: jest.fn(() => camera),
    });
    csUtils.getTargetVolumeAndSpacingInNormalDir.mockReturnValue({
      spacingInNormalDirection: 2,
    });

    const result = filterAnnotationsForDisplay(viewport, [inSlice, outOfSlice]);

    expect(result).toEqual([inSlice]);
    expect(viewport.getCamera).toHaveBeenCalled();
  });

  it('native volume-mode viewport: uses getViewportICamera bridge + geometric filter', () => {
    csUtils.getViewportContentMode.mockReturnValue('volume');
    csUtils.getTargetVolumeAndSpacingInNormalDir.mockReturnValue({
      spacingInNormalDirection: 2,
    });
    getViewportICamera.mockReturnValue(camera);

    const inSlice = makeAnnotation({
      viewPlaneNormal: [0, 0, 1],
      points: [[0, 0, 0.2]],
    });
    // A viewport that is neither the mocked VolumeViewport nor StackViewport.
    const viewport = {};

    const result = filterAnnotationsForDisplay(viewport, [inSlice]);

    expect(result).toEqual([inSlice]);
    expect(getViewportICamera).toHaveBeenCalledWith(viewport);
  });

  it('StackViewport: returns [] when there is no current image id', () => {
    const viewport = Object.assign(Object.create(StackViewport.prototype), {
      getCurrentImageId: jest.fn(() => undefined),
    });
    csUtils.getViewportContentMode.mockReturnValue('stack');

    const result = filterAnnotationsForDisplay(viewport, [makeAnnotation()]);

    expect(result).toEqual([]);
  });

  it('StackViewport: strips the data-loader scheme and delegates to isReferenceViewable', () => {
    const isReferenceViewable = jest.fn(() => true);
    const viewport = Object.assign(Object.create(StackViewport.prototype), {
      getCurrentImageId: jest.fn(() => 'volumeLoader://1.2.3'),
      isReferenceViewable,
    });
    csUtils.getViewportContentMode.mockReturnValue('stack');
    const annotation = makeAnnotation();

    const result = filterAnnotationsForDisplay(viewport, [annotation]);

    expect(result).toEqual([annotation]);
    // colonIndex is the first ':' (after the "volumeLoader" scheme); the
    // "://" separator is preserved because substring starts at colonIndex+1.
    expect(isReferenceViewable).toHaveBeenCalledWith(annotation.metadata, {
      imageURI: '//1.2.3',
    });
  });

  it('StackViewport: excludes invisible annotations without calling isReferenceViewable', () => {
    const isReferenceViewable = jest.fn(() => true);
    const viewport = Object.assign(Object.create(StackViewport.prototype), {
      getCurrentImageId: jest.fn(() => 'stack://image1'),
      isReferenceViewable,
    });
    csUtils.getViewportContentMode.mockReturnValue('stack');
    const annotation = makeAnnotation({ isVisible: false });

    const result = filterAnnotationsForDisplay(viewport, [annotation]);

    expect(result).toEqual([]);
    expect(isReferenceViewable).not.toHaveBeenCalled();
  });

  it('generic viewport: always keeps canvas annotations without calling isReferenceViewable', () => {
    const isReferenceViewable = jest.fn(() => false);
    const viewport = { isReferenceViewable };
    csUtils.getViewportContentMode.mockReturnValue(undefined);
    const annotation = makeAnnotation({ isCanvasAnnotation: true });

    const result = filterAnnotationsForDisplay(viewport, [annotation]);

    expect(result).toEqual([annotation]);
    expect(isReferenceViewable).not.toHaveBeenCalled();
  });

  it('generic viewport: falls through to isReferenceViewable with the given filterOptions', () => {
    const isReferenceViewable = jest.fn(() => false);
    const viewport = { isReferenceViewable };
    csUtils.getViewportContentMode.mockReturnValue(undefined);
    const annotation = makeAnnotation();

    const result = filterAnnotationsForDisplay(viewport, [annotation], {
      withNavigation: true,
    });

    expect(result).toEqual([]);
    expect(isReferenceViewable).toHaveBeenCalledWith(annotation.metadata, {
      withNavigation: true,
    });
  });
});

describe('utilities/planar/getWorldWidthAndHeightFromCorners', () => {
  // Axial-style basis: viewPlaneNormal = +Z, viewUp = +Y.
  // viewRight = cross(viewUp, viewPlaneNormal) = cross([0,1,0],[0,0,1]) = [1,0,0]
  const viewPlaneNormal = [0, 0, 1];
  const viewUp = [0, 1, 0];

  it('pure width case: diagonal antiparallel to viewRight -> sinTheta=0', () => {
    // diagonal = topLeft - bottomRight = [0,0,0]-[10,0,0] = [-10,0,0]
    // diagonalLength = 10; dot(diagonal, viewRight=[1,0,0]) = -10
    // cosTheta = -10/10 = -1 -> sinTheta = sqrt(1-1) = 0
    // worldWidth = 0*10 = 0 ; worldHeight = -1*10 = -10
    const { worldWidth, worldHeight } = getWorldWidthAndHeightFromCorners(
      viewPlaneNormal,
      viewUp,
      [0, 0, 0],
      [10, 0, 0]
    );

    expect(worldWidth).toBeCloseTo(0, 10);
    expect(worldHeight).toBeCloseTo(-10, 10);
  });

  it('pure height case: diagonal perpendicular to viewRight -> cosTheta=0', () => {
    // diagonal = [0,0,0]-[0,10,0] = [0,-10,0]; dot with viewRight=[1,0,0] = 0
    // cosTheta = 0 -> sinTheta = 1
    // worldWidth = 1*10 = 10 ; worldHeight = 0*10 = 0
    const { worldWidth, worldHeight } = getWorldWidthAndHeightFromCorners(
      viewPlaneNormal,
      viewUp,
      [0, 0, 0],
      [0, 10, 0]
    );

    expect(worldWidth).toBeCloseTo(10, 10);
    expect(worldHeight).toBeCloseTo(0, 10);
  });

  it('oblique 3-4-5 case: exact width/height decomposition', () => {
    // diagonal = [0,0,0]-[-3,-4,0] = [3,4,0]; diagonalLength = 5
    // dot(diagonal, viewRight=[1,0,0]) = 3 -> cosTheta = 3/5 = 0.6
    // sinTheta = sqrt(1-0.36) = sqrt(0.64) = 0.8
    // worldWidth = 0.8*5 = 4 ; worldHeight = 0.6*5 = 3
    const { worldWidth, worldHeight } = getWorldWidthAndHeightFromCorners(
      viewPlaneNormal,
      viewUp,
      [0, 0, 0],
      [-3, -4, 0]
    );

    expect(worldWidth).toBeCloseTo(4, 10);
    expect(worldHeight).toBeCloseTo(3, 10);
  });

  it('degenerate case: near-coincident points return {0,0} to avoid NaN', () => {
    const { worldWidth, worldHeight } = getWorldWidthAndHeightFromCorners(
      viewPlaneNormal,
      viewUp,
      [1, 1, 1],
      [1, 1, 1.00001] // diagonalLength = 0.00001 < 0.0001 threshold
    );

    expect(worldWidth).toBe(0);
    expect(worldHeight).toBe(0);
  });
});

describe('utilities/planar/getWorldWidthAndHeightFromTwoPoints', () => {
  // Same math as FromCorners (this is effectively a duplicate implementation
  // with different argument names), spot-checked here for coverage.
  const viewPlaneNormal = [0, 0, 1];
  const viewUp = [0, 1, 0];

  it('oblique 3-4-5 case matches getWorldWidthAndHeightFromCorners', () => {
    const { worldWidth, worldHeight } = getWorldWidthAndHeightFromTwoPoints(
      viewPlaneNormal,
      viewUp,
      [0, 0, 0],
      [-3, -4, 0]
    );

    expect(worldWidth).toBeCloseTo(4, 10);
    expect(worldHeight).toBeCloseTo(3, 10);
  });

  it('degenerate case returns {0,0}', () => {
    const { worldWidth, worldHeight } = getWorldWidthAndHeightFromTwoPoints(
      viewPlaneNormal,
      viewUp,
      [0, 0, 0],
      [0, 0, 0.00001]
    );

    expect(worldWidth).toBe(0);
    expect(worldHeight).toBe(0);
  });
});

describe('utilities/planar/isPlaneIntersectingAABB', () => {
  const box = { minX: 0, minY: 0, minZ: 0, maxX: 10, maxY: 10, maxZ: 10 };

  it('returns true when the plane passes through the middle of the box', () => {
    // Plane z=5 with normal +Z: bottom face (z=0) is below, top face (z=10)
    // is above -> vertices on both sides.
    const result = isPlaneIntersectingAABB(
      [5, 5, 5],
      [0, 0, 1],
      box.minX,
      box.minY,
      box.minZ,
      box.maxX,
      box.maxY,
      box.maxZ
    );

    expect(result).toBe(true);
  });

  it('returns false when the plane is entirely outside the box', () => {
    // Plane at z=-100 with normal +Z: every vertex (z in [0,10]) is on the
    // same (positive) side.
    const result = isPlaneIntersectingAABB(
      [-100, -100, -100],
      [0, 0, 1],
      box.minX,
      box.minY,
      box.minZ,
      box.maxX,
      box.maxY,
      box.maxZ
    );

    expect(result).toBe(false);
  });

  it('tangent case: plane coincides with the box bottom face still counts as intersecting', () => {
    // Plane z=0 with normal +Z: the 4 bottom vertices sit exactly on the
    // plane (signed distance 0) while the 4 top vertices are strictly
    // positive (distance 10) -> Math.sign(0) !== Math.sign(10) -> true.
    const result = isPlaneIntersectingAABB(
      [0, 0, 0],
      [0, 0, 1],
      box.minX,
      box.minY,
      box.minZ,
      box.maxX,
      box.maxY,
      box.maxZ
    );

    expect(result).toBe(true);
  });

  it('tangent case: plane touching only the far corner still counts as intersecting', () => {
    // Plane through (10,10,10) with normal (1,1,1): 7 vertices are strictly
    // on the negative side, the (max,max,max) corner has signed distance 0.
    // Math.sign(0) !== Math.sign(negative) -> true (touching == intersecting
    // under this algorithm's convention).
    const result = isPlaneIntersectingAABB(
      [10, 10, 10],
      [1, 1, 1],
      box.minX,
      box.minY,
      box.minZ,
      box.maxX,
      box.maxY,
      box.maxZ
    );

    expect(result).toBe(true);
  });
});

describe('utilities/planar/getPointInLineOfSightWithCriteria', () => {
  function makeViewport({ intensityFn }) {
    return {
      getCamera: jest.fn(() => ({
        focalPoint: [0, 0, 0],
        viewPlaneNormal: [0, 0, 1],
      })),
      // Bounds padded by 10 inside _inBounds -> usable range is (-5,5) on
      // every axis for these tight bounds.
      getBounds: jest.fn(() => [-15, 15, -15, 15, -15, 15]),
      getIntensityFromWorld: jest.fn(intensityFn),
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getPointsInLineOfSight samples symmetric steps along the normal within bounds', () => {
    csUtils.getTargetVolumeAndSpacingInNormalDir.mockReturnValue({
      spacingInNormalDirection: 4, // step = 4 * stepSize(0.25) = 1
    });
    const viewport = makeViewport({ intensityFn: () => 0 });

    const points = getPointsInLineOfSight(viewport, [0, 0, 0], {
      targetVolumeId: 'vol1',
      stepSize: 0.25,
    });

    // Positive direction: z = 0..4 (z=5 fails the strict "< 5" bound check).
    // Negative direction (restarts from worldPos): z = 0,-1,-2,-3,-4.
    const zValues = points.map((p) => p[2]);
    expect(zValues).toEqual([0, 1, 2, 3, 4, 0, -1, -2, -3, -4]);
  });

  it('picks the point with the running-maximum intensity along the line of sight', () => {
    csUtils.getTargetVolumeAndSpacingInNormalDir.mockReturnValue({
      spacingInNormalDirection: 4,
    });
    // Intensity defined as the z coordinate of the sampled point.
    const viewport = makeViewport({ intensityFn: (point) => point[2] });

    let maxIntensity = -Infinity;
    const keepRunningMax = (intensity, point) => {
      if (intensity > maxIntensity) {
        maxIntensity = intensity;
        return point;
      }
      return undefined;
    };

    const result = getPointInLineOfSightWithCriteria(
      viewport,
      [0, 0, 0],
      'vol1',
      keepRunningMax,
      0.25
    );

    // Sampling order (see test above) visits z=4 (the max) before any of the
    // negative-direction samples, all of which are smaller -> final pick is
    // the last point where a new max was set: z=4.
    expect(result).toEqual([0, 0, 4]);
  });
});

describe('utilities/boundingBox/getBoundingBoxAroundShapeIJK', () => {
  it('computes exact min/max per axis for a 2D point cloud with no dimensions', () => {
    const bounds = getBoundingBoxAroundShapeIJK([
      [2, 9],
      [7, 3],
    ]);

    expect(bounds).toEqual([[2, 7], [3, 9], null]);
  });

  it('clamps to [0, dimension-1] per axis when dimensions are provided (2D)', () => {
    const bounds = getBoundingBoxAroundShapeIJK(
      [
        [-5, -5],
        [15, 3],
      ],
      [10, 10]
    );

    // xMin: max(0,-5)=0 ; xMax: min(9,15)=9
    // yMin: max(0,-5)=0 ; yMax: min(9,3)=3
    expect(bounds).toEqual([[0, 9], [0, 3], null]);
  });

  it('handles 3D point clouds and clamps all three axes', () => {
    const bounds = getBoundingBoxAroundShapeIJK(
      [
        [-2, -2, -2],
        [20, 20, 20],
      ],
      [10, 10, 10]
    );

    expect(bounds).toEqual([
      [0, 9],
      [0, 9],
      [0, 9],
    ]);
  });

  it('degenerate single-point 3D case collapses min===max on every axis', () => {
    const bounds = getBoundingBoxAroundShapeIJK([[4, 4, 4]]);

    expect(bounds).toEqual([
      [4, 4],
      [4, 4],
      [4, 4],
    ]);
  });
});

describe('utilities/boundingBox/getBoundingBoxAroundShapeWorld', () => {
  it('returns exact raw min/max per axis when no clip bounds are provided', () => {
    const bounds = getBoundingBoxAroundShapeWorld([
      [-3.5, 2.25, 0],
      [10, -1, 8],
    ]);

    expect(bounds).toEqual([
      [-3.5, 10],
      [-1, 2.25],
      [0, 8],
    ]);
  });

  // SUSPECTED PRODUCT BUG (getBoundingBoxAroundShape.ts calculateBoundingBox,
  // isWorld branch): when clip dimensions are supplied, xMin is clamped to
  // >= dimensions[0]+EPSILON while xMax is clamped to <= dimensions[0]-EPSILON
  // -- i.e. both the lower AND upper clip use the *same* dimensions[0] value
  // (offset by +/-EPSILON), rather than a [min,max] pair. For any positive
  // dimensions[0] this forces xMin > xMax (an inverted, empty range) whenever
  // clamping actually kicks in. getBoundingBoxAroundShapeWorld has no callers
  // in src/ today, which is likely why this has gone unnoticed.
  it('documents the inverted-range clip bug when world clipBounds are supplied', () => {
    const bounds = getBoundingBoxAroundShapeWorld(
      [
        [-5, -5, -5],
        [5, 5, 5],
      ],
      [3, 3, 3]
    );

    // xMin = max(3+EPSILON, -5) = 3.001 ; xMax = min(3-EPSILON, 5) = 2.999
    // (same formula applies to y and z) -- min ends up greater than max.
    expect(bounds[0][0]).toBeCloseTo(3 + EPSILON, 10);
    expect(bounds[0][1]).toBeCloseTo(3 - EPSILON, 10);
    expect(bounds[0][0]).toBeGreaterThan(bounds[0][1]);
  });
});

describe('utilities/boundingBox/extend2DBoundingBoxInViewAxis', () => {
  it('extends the axis whose min/max already collapse to a single slice index', () => {
    // k-axis (index 2) is the slice-normal axis: 7 === 7.
    const boundsIJK = [
      [2, 8],
      [1, 6],
      [7, 7],
    ];

    const result = extend2DBoundingBoxInViewAxis(boundsIJK, 2);

    expect(result).toEqual([
      [2, 8],
      [1, 6],
      [5, 9], // 7-2, 7+2
    ]);
    // The function mutates its input argument in place (returns same ref).
    expect(result).toBe(boundsIJK);
  });

  it('throws when no axis has a collapsed min===max (oblique / 3D box)', () => {
    const boundsIJK = [
      [1, 2],
      [3, 4],
      [5, 6],
    ];

    expect(() => extend2DBoundingBoxInViewAxis(boundsIJK, 1)).toThrow(
      /3D bounding boxes not supported in an oblique plane/
    );
  });
});

describe('utilities/boundingBox/snapIndexBounds', () => {
  it('collapses to a single rounded index when delta <= 1', () => {
    // delta = 0.6 <= 1 -> index = round((3.2+3.8)/2) = round(3.5) = 4
    expect(snapIndexBounds(3.2, 3.8)).toEqual([4, 4]);
  });

  it('collapses to a single rounded index at the delta===1 boundary', () => {
    // delta = 1 <= 1 -> index = round(2.5) = 3 (JS rounds .5 up)
    expect(snapIndexBounds(2, 3)).toEqual([3, 3]);
  });

  it('uses floor/ceil to preserve coverage when delta > 1', () => {
    // delta = 3.5 > 1 -> [floor(2.2), ceil(5.7)] = [2, 6]
    expect(snapIndexBounds(2.2, 5.7)).toEqual([2, 6]);
  });

  it('uses floor/ceil just past the delta===1 boundary', () => {
    // delta = 1.0001 > 1 -> [floor(0), ceil(1.0001)] = [0, 2]
    expect(snapIndexBounds(0, 1.0001)).toEqual([0, 2]);
  });
});
