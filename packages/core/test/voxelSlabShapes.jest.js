import { collectVoxelsInSlab } from '../src/utilities/voxelSlab/iterateVoxelsInSlab';
import { buildIndexSpaceSlab } from '../src/utilities/voxelSlab/indexSpaceSlab';
import getVoxelThicknessAlongNormal from '../src/utilities/voxelSlab/getVoxelThicknessAlongNormal';
import {
  createEllipseShape,
  createCircleShape,
} from '../src/utilities/voxelSlab/shapes/createEllipseShape';
import { createRectangleShape } from '../src/utilities/voxelSlab/shapes/createRectangleShape';
import { createContourShape } from '../src/utilities/voxelSlab/shapes/createContourShape';
import {
  createPlaneBasis,
  solveAbsLinearLeq,
  solveQuadraticLeqZero,
  toIntegerRun,
  intersectRanges,
} from '../src/utilities/voxelSlab/shapes/shapeGeometry';
import {
  createSyntheticVolume,
  rotatedDirection,
  obliqueNormal,
} from './utils/syntheticVolume';
import {
  referenceVoxelsInSlab,
  canonicaliseVoxels,
} from './utils/voxelSlabReference';

const AXIAL = [0, 0, 1];

/**
 * The contract every shape must satisfy: the closed-form runs, the per-voxel
 * predicate through the iterator, and the brute-force reference implementation
 * must all select exactly the same voxels.
 */
function expectShapeConsistency(
  { volume, planePoint, normal, annotationThickness, shape },
  label = ''
) {
  const viaRuns = collectVoxelsInSlab({
    volume,
    planePoint,
    normal,
    annotationThickness,
    getShapeRuns: shape.getRuns,
  });

  const viaPredicate = collectVoxelsInSlab({
    volume,
    planePoint,
    normal,
    annotationThickness,
    isInShape: (center) => shape.containsPoint(center),
  });

  const viaReference = referenceVoxelsInSlab({
    volume,
    planePoint,
    normal,
    annotationThickness,
    isInShape: (_projected, _ijk, center) => shape.containsPoint(center),
  });

  const canonicalRuns = canonicaliseVoxels(viaRuns);

  expect(canonicalRuns).toEqual(canonicaliseVoxels(viaPredicate));
  expect(canonicalRuns).toEqual(canonicaliseVoxels(viaReference));
  // No duplicates: a run overlapping another would show up as a length change.
  expect(new Set(canonicalRuns).size).toBe(canonicalRuns.length);

  if (label) {
    expect(canonicalRuns.length).toBeGreaterThan(0);
  }

  return viaRuns;
}

describe('shapeGeometry solvers', () => {
  describe('solveAbsLinearLeq', () => {
    it('solves |a + t b| <= h', () => {
      expect(solveAbsLinearLeq(0, 1, 2)).toEqual([-2, 2]);
      expect(solveAbsLinearLeq(1, 1, 2)).toEqual([-3, 1]);
    });

    it('orders the interval regardless of the slope sign', () => {
      expect(solveAbsLinearLeq(0, -1, 2)).toEqual([-2, 2]);
      expect(solveAbsLinearLeq(1, -2, 3)).toEqual([-1, 2]);
    });

    it('is unbounded or empty when the slope is zero', () => {
      expect(solveAbsLinearLeq(1, 0, 2)).toEqual([-Infinity, Infinity]);
      expect(solveAbsLinearLeq(5, 0, 2)).toBeNull();
    });
  });

  describe('solveQuadraticLeqZero', () => {
    it('returns the interval between the roots', () => {
      // t^2 - 1 <= 0
      expect(solveQuadraticLeqZero(1, 0, -1)).toEqual([-1, 1]);
    });

    it('returns null when the parabola never dips to zero', () => {
      expect(solveQuadraticLeqZero(1, 0, 1)).toBeNull();
    });

    it('returns a single point for a tangent parabola', () => {
      expect(solveQuadraticLeqZero(1, 0, 0)).toEqual([0, 0]);
    });

    it('degenerates to the linear case when the quadratic term vanishes', () => {
      expect(solveQuadraticLeqZero(0, 2, -4)).toEqual([-Infinity, 2]);
      expect(solveQuadraticLeqZero(0, -2, -4)).toEqual([-2, Infinity]);
      expect(solveQuadraticLeqZero(0, 0, -1)).toEqual([-Infinity, Infinity]);
      expect(solveQuadraticLeqZero(0, 0, 1)).toBeNull();
    });
  });

  describe('toIntegerRun', () => {
    it('includes integers on the boundary, unlike the depth runs', () => {
      expect(toIntegerRun([2, 5])).toEqual([2, 5]);
      expect(toIntegerRun([2.1, 4.9])).toEqual([3, 4]);
    });

    it('returns null when no integer fits', () => {
      expect(toIntegerRun([2.1, 2.9])).toBeNull();
      expect(toIntegerRun(null)).toBeNull();
    });
  });

  describe('intersectRanges', () => {
    it('intersects, and reports disjoint ranges as null', () => {
      expect(intersectRanges([0, 5], [3, 9])).toEqual([3, 5]);
      expect(intersectRanges([0, 2], [3, 9])).toBeNull();
      expect(intersectRanges(null, [3, 9])).toBeNull();
    });
  });

  describe('createPlaneBasis', () => {
    it('removes the normal component from the orientation vector', () => {
      const { u, v, n } = createPlaneBasis([0, 0, 1], [1, 0, 5]);

      expect(u[2]).toBeCloseTo(0, 10);
      expect(Math.hypot(...u)).toBeCloseTo(1, 10);
      expect(Math.hypot(...v)).toBeCloseTo(1, 10);
      // Orthonormal frame.
      expect(u[0] * v[0] + u[1] * v[1] + u[2] * v[2]).toBeCloseTo(0, 10);
      expect(u[0] * n[0] + u[1] * n[1] + u[2] * n[2]).toBeCloseTo(0, 10);
    });

    it('throws when the orientation is parallel to the normal', () => {
      expect(() => createPlaneBasis([0, 0, 1], [0, 0, 3])).toThrow(
        /parallel to the plane normal/
      );
    });
  });
});

describe('createEllipseShape - planar', () => {
  const volume = createSyntheticVolume({
    dimensions: [20, 20, 6],
    spacing: [1, 1, 1],
  });
  const planePoint = [10, 10, 3];

  it('rejects non-positive radii', () => {
    expect(() =>
      createEllipseShape({
        volume,
        planePoint,
        normal: AXIAL,
        center: planePoint,
        majorAxis: [1, 0, 0],
        majorRadius: 0,
        minorRadius: 2,
      })
    ).toThrow(/radii must be positive/);
  });

  it('selects a single layer of the expected extent when axis aligned', () => {
    const shape = createEllipseShape({
      volume,
      planePoint,
      normal: AXIAL,
      center: planePoint,
      majorAxis: [1, 0, 0],
      majorRadius: 4.5,
      minorRadius: 2.5,
    });

    const voxels = expectShapeConsistency({
      volume,
      planePoint,
      normal: AXIAL,
      annotationThickness: 1,
      shape,
    });

    const iValues = voxels.map(([i]) => i);
    const jValues = voxels.map(([, j]) => j);
    expect(new Set(voxels.map(([, , k]) => k))).toEqual(new Set([3]));
    // Major axis along x reaches +/-4, minor along y reaches +/-2.
    expect(Math.min(...iValues)).toBe(6);
    expect(Math.max(...iValues)).toBe(14);
    expect(Math.min(...jValues)).toBe(8);
    expect(Math.max(...jValues)).toBe(12);
  });

  it('follows the orientation vector when rotated', () => {
    // Swapping the orientation to y must swap which axis is long.
    const shape = createEllipseShape({
      volume,
      planePoint,
      normal: AXIAL,
      center: planePoint,
      majorAxis: [0, 1, 0],
      majorRadius: 4.5,
      minorRadius: 2.5,
    });

    const voxels = expectShapeConsistency({
      volume,
      planePoint,
      normal: AXIAL,
      annotationThickness: 1,
      shape,
    });

    expect(Math.min(...voxels.map(([i]) => i))).toBe(8);
    expect(Math.max(...voxels.map(([i]) => i))).toBe(12);
    expect(Math.min(...voxels.map(([, j]) => j))).toBe(6);
    expect(Math.max(...voxels.map(([, j]) => j))).toBe(14);
  });

  it('accepts an orientation vector that is not in the plane', () => {
    const inPlane = createEllipseShape({
      volume,
      planePoint,
      normal: AXIAL,
      center: planePoint,
      majorAxis: [1, 0, 0],
      majorRadius: 4.5,
      minorRadius: 2.5,
    });
    const tilted = createEllipseShape({
      volume,
      planePoint,
      normal: AXIAL,
      center: planePoint,
      majorAxis: [1, 0, 7],
      majorRadius: 4.5,
      minorRadius: 2.5,
    });

    const options = {
      volume,
      planePoint,
      normal: AXIAL,
      annotationThickness: 1,
    };
    expect(
      canonicaliseVoxels(
        collectVoxelsInSlab({ ...options, getShapeRuns: tilted.getRuns })
      )
    ).toEqual(
      canonicaliseVoxels(
        collectVoxelsInSlab({ ...options, getShapeRuns: inPlane.getRuns })
      )
    );
  });

  it('is planar, so it needs no thickness of its own', () => {
    const shape = createCircleShape({
      volume,
      planePoint,
      normal: AXIAL,
      center: planePoint,
      radius: 3,
    });
    expect(shape.getRequiredThickness()).toBe(0);
  });

  it('agrees at several oblique angles', () => {
    const oblique = createSyntheticVolume({
      dimensions: [16, 16, 12],
      spacing: [0.9, 0.9, 2.2],
    });

    [10, 25, 40, 55, 70].forEach((degrees) => {
      const normal = obliqueNormal(oblique.direction, degrees);
      const anchor = [7, 7, 13];
      const shape = createEllipseShape({
        volume: oblique,
        planePoint: anchor,
        normal,
        center: anchor,
        majorAxis: [1, 0, 0],
        majorRadius: 4,
        minorRadius: 2,
      });

      expectShapeConsistency(
        {
          volume: oblique,
          planePoint: anchor,
          normal,
          annotationThickness: getVoxelThicknessAlongNormal(oblique, normal),
          shape,
        },
        `${degrees} degrees`
      );
    });
  });

  it('agrees on a rotated, anisotropic volume', () => {
    const direction = rotatedDirection(29, 'y');
    const tilted = createSyntheticVolume({
      dimensions: [16, 16, 16],
      spacing: [0.7, 1.3, 1.9],
      direction,
      origin: [-4, 6, 2],
    });
    const normal = obliqueNormal(direction, 33);
    const anchor = [-1, 12, 12];

    expectShapeConsistency(
      {
        volume: tilted,
        planePoint: anchor,
        normal,
        annotationThickness: 3,
        shape: createEllipseShape({
          volume: tilted,
          planePoint: anchor,
          normal,
          center: anchor,
          majorAxis: [0, 1, 0],
          majorRadius: 5,
          minorRadius: 2.5,
        }),
      },
      'rotated anisotropic'
    );
  });
});

describe('createEllipseShape - solid', () => {
  const volume = createSyntheticVolume({
    dimensions: [16, 16, 16],
    spacing: [1, 1, 1],
  });
  const planePoint = [8, 8, 8];

  it('reports the thickness needed to contain itself', () => {
    const shape = createEllipseShape({
      volume,
      planePoint,
      normal: AXIAL,
      center: planePoint,
      majorAxis: [1, 0, 0],
      majorRadius: 4,
      minorRadius: 3,
      depthRadius: 2,
    });

    // Depth semi-axis is dilated by half a voxel, so 2 * (2 + 0.5).
    expect(shape.getRequiredThickness()).toBeCloseTo(5, 10);
  });

  it('spans several layers and tapers away from the plane', () => {
    const shape = createEllipseShape({
      volume,
      planePoint,
      normal: AXIAL,
      center: planePoint,
      majorAxis: [1, 0, 0],
      majorRadius: 5,
      minorRadius: 5,
      depthRadius: 3,
    });

    const voxels = expectShapeConsistency({
      volume,
      planePoint,
      normal: AXIAL,
      annotationThickness: shape.getRequiredThickness(),
      shape,
    });

    const perLayer = new Map();
    voxels.forEach(([, , k]) => perLayer.set(k, (perLayer.get(k) ?? 0) + 1));

    // Multiple layers, widest at the centre, tapering both ways.
    expect(perLayer.size).toBeGreaterThan(3);
    expect(perLayer.get(8)).toBeGreaterThan(perLayer.get(10));
    expect(perLayer.get(8)).toBeGreaterThan(perLayer.get(6));
    expect(perLayer.get(6)).toBe(perLayer.get(10));
  });

  it('is a ball, symmetric about its centre, when all radii match', () => {
    const shape = createCircleShape({
      volume,
      planePoint,
      normal: AXIAL,
      center: planePoint,
      radius: 4,
      depthRadius: 4,
    });

    const voxels = expectShapeConsistency({
      volume,
      planePoint,
      normal: AXIAL,
      annotationThickness: shape.getRequiredThickness(),
      shape,
    });

    const keys = new Set(voxels.map(([i, j, k]) => `${i},${j},${k}`));
    // Every included voxel's mirror through the centre is also included.
    voxels.forEach(([i, j, k]) => {
      expect(keys.has(`${16 - i},${16 - j},${16 - k}`)).toBe(true);
    });
  });

  it('agrees at oblique angles', () => {
    const oblique = createSyntheticVolume({
      dimensions: [16, 16, 14],
      spacing: [1, 1, 1.8],
    });

    [20, 45, 65].forEach((degrees) => {
      const normal = obliqueNormal(oblique.direction, degrees);
      const anchor = [8, 8, 12];
      const shape = createEllipseShape({
        volume: oblique,
        planePoint: anchor,
        normal,
        center: anchor,
        majorAxis: [1, 0, 0],
        majorRadius: 4,
        minorRadius: 3,
        depthRadius: 2.5,
      });

      expectShapeConsistency(
        {
          volume: oblique,
          planePoint: anchor,
          normal,
          annotationThickness: shape.getRequiredThickness(),
          shape,
        },
        `solid at ${degrees} degrees`
      );
    });
  });
});

describe('createRectangleShape', () => {
  const volume = createSyntheticVolume({
    dimensions: [20, 20, 8],
    spacing: [1, 1, 1],
  });
  const planePoint = [10, 10, 4];

  it('rejects non-positive half lengths', () => {
    expect(() =>
      createRectangleShape({
        volume,
        planePoint,
        normal: AXIAL,
        center: planePoint,
        majorAxis: [1, 0, 0],
        majorHalfLength: 3,
        minorHalfLength: -1,
      })
    ).toThrow(/half lengths must be positive/);
  });

  it('selects exactly the enclosed block when axis aligned', () => {
    const shape = createRectangleShape({
      volume,
      planePoint,
      normal: AXIAL,
      center: planePoint,
      majorAxis: [1, 0, 0],
      majorHalfLength: 3.5,
      minorHalfLength: 2.5,
    });

    const voxels = expectShapeConsistency({
      volume,
      planePoint,
      normal: AXIAL,
      annotationThickness: 1,
      shape,
    });

    // x within +/-3.5 of 10 gives 7..13, y within +/-2.5 gives 8..12.
    expect(voxels).toHaveLength(7 * 5);
    expect(Math.min(...voxels.map(([i]) => i))).toBe(7);
    expect(Math.max(...voxels.map(([i]) => i))).toBe(13);
    expect(Math.min(...voxels.map(([, j]) => j))).toBe(8);
    expect(Math.max(...voxels.map(([, j]) => j))).toBe(12);
  });

  it('includes voxel centres lying exactly on the outline', () => {
    const shape = createRectangleShape({
      volume,
      planePoint,
      normal: AXIAL,
      center: planePoint,
      majorAxis: [1, 0, 0],
      majorHalfLength: 3,
      minorHalfLength: 2,
    });

    const voxels = expectShapeConsistency({
      volume,
      planePoint,
      normal: AXIAL,
      annotationThickness: 1,
      shape,
    });

    // Boundaries at exactly +/-3 and +/-2 are inclusive.
    expect(voxels).toHaveLength(7 * 5);
  });

  it('rotates with the orientation vector', () => {
    const shape = createRectangleShape({
      volume,
      planePoint,
      normal: AXIAL,
      center: planePoint,
      majorAxis: [1, 1, 0],
      majorHalfLength: 6,
      minorHalfLength: 1,
    });

    const voxels = expectShapeConsistency({
      volume,
      planePoint,
      normal: AXIAL,
      annotationThickness: 1,
      shape,
    });

    // A long thin bar at 45 degrees covers a diagonal band, so its extents in
    // both i and j are wider than the minor half length.
    expect(Math.max(...voxels.map(([i]) => i))).toBeGreaterThan(13);
    expect(Math.max(...voxels.map(([, j]) => j))).toBeGreaterThan(13);
  });

  it('as a box, matches the slab at twice its depth half length', () => {
    const cube = createSyntheticVolume({
      dimensions: [16, 16, 16],
      spacing: [1, 1, 1],
    });
    const anchor = [8, 8, 8];
    const shape = createRectangleShape({
      volume: cube,
      planePoint: anchor,
      normal: AXIAL,
      center: anchor,
      majorAxis: [1, 0, 0],
      majorHalfLength: 3.5,
      minorHalfLength: 3.5,
      depthHalfLength: 1.5,
    });

    const voxels = expectShapeConsistency({
      volume: cube,
      planePoint: anchor,
      normal: AXIAL,
      annotationThickness: shape.getRequiredThickness(),
      shape,
    });

    // Depth extent 1.5 dilated to 2.0 gives layers 6..10.
    expect(
      [...new Set(voxels.map(([, , k]) => k))].sort((a, b) => a - b)
    ).toEqual([6, 7, 8, 9, 10]);
  });

  it('agrees at oblique angles', () => {
    const oblique = createSyntheticVolume({
      dimensions: [16, 16, 12],
      spacing: [1.1, 0.8, 2.0],
    });

    [15, 35, 60, 80].forEach((degrees) => {
      const normal = obliqueNormal(oblique.direction, degrees);
      const anchor = [8, 7, 12];

      expectShapeConsistency(
        {
          volume: oblique,
          planePoint: anchor,
          normal,
          annotationThickness: getVoxelThicknessAlongNormal(oblique, normal),
          shape: createRectangleShape({
            volume: oblique,
            planePoint: anchor,
            normal,
            center: anchor,
            majorAxis: [1, 0, 0],
            majorHalfLength: 4,
            minorHalfLength: 2.5,
          }),
        },
        `rect at ${degrees} degrees`
      );
    });
  });
});

describe('createContourShape', () => {
  const volume = createSyntheticVolume({
    dimensions: [20, 20, 6],
    spacing: [1, 1, 1],
  });
  const planePoint = [10, 10, 3];

  const square = (cx, cy, half, z) => [
    [cx - half, cy - half, z],
    [cx + half, cy - half, z],
    [cx + half, cy + half, z],
    [cx - half, cy + half, z],
  ];

  it('rejects a degenerate outline', () => {
    expect(() =>
      createContourShape({
        volume,
        planePoint,
        normal: AXIAL,
        polyline: [
          [0, 0, 3],
          [1, 0, 3],
        ],
      })
    ).toThrow(/at least three points/);
  });

  it('matches the equivalent rectangle for a square outline', () => {
    const options = {
      volume,
      planePoint,
      normal: AXIAL,
      annotationThickness: 1,
    };

    const contour = createContourShape({
      volume,
      planePoint,
      normal: AXIAL,
      polyline: square(10, 10, 3.5, 3),
    });
    const rectangle = createRectangleShape({
      volume,
      planePoint,
      normal: AXIAL,
      center: [10, 10, 3],
      majorAxis: [1, 0, 0],
      majorHalfLength: 3.5,
      minorHalfLength: 3.5,
    });

    expectShapeConsistency({ ...options, shape: contour });

    expect(
      canonicaliseVoxels(
        collectVoxelsInSlab({ ...options, getShapeRuns: contour.getRuns })
      )
    ).toEqual(
      canonicaliseVoxels(
        collectVoxelsInSlab({ ...options, getShapeRuns: rectangle.getRuns })
      )
    );
  });

  it('handles a contour whose points carry depth error', () => {
    // A drawn contour never lies exactly in the plane.
    const noisy = square(10, 10, 3.5, 3).map(([x, y, z], index) => [
      x,
      y,
      z + (index % 2 ? 0.02 : -0.03),
    ]);

    expectShapeConsistency({
      volume,
      planePoint,
      normal: AXIAL,
      annotationThickness: 1,
      shape: createContourShape({
        volume,
        planePoint,
        normal: AXIAL,
        polyline: noisy,
      }),
    });
  });

  describe('non-convex outlines', () => {
    // A U opening towards +y: rows above the base cross the two arms.
    const uShape = [
      [2, 2, 3],
      [16, 2, 3],
      [16, 16, 3],
      [12, 16, 3],
      [12, 6, 3],
      [6, 6, 3],
      [6, 16, 3],
      [2, 16, 3],
    ];

    it('agrees with the predicate and the reference', () => {
      expectShapeConsistency(
        {
          volume,
          planePoint,
          normal: AXIAL,
          annotationThickness: 1,
          shape: createContourShape({
            volume,
            planePoint,
            normal: AXIAL,
            polyline: uShape,
          }),
        },
        'U outline'
      );
    });

    it('emits more than one run for a row crossing both arms', () => {
      const shape = createContourShape({
        volume,
        planePoint,
        normal: AXIAL,
        polyline: uShape,
      });
      const slab = buildIndexSpaceSlab(volume, planePoint, AXIAL, 1);

      // Collect run counts across every row of the outer layer.
      const runCounts = [];
      for (let row = 0; row < 20; row++) {
        const runs = [...shape.getRuns(3, row, [0, 19], slab)];
        runCounts.push(runs.length);
      }

      expect(Math.max(...runCounts)).toBeGreaterThanOrEqual(2);
      // And the runs of a multi-run row must be disjoint and ordered.
      const multi = [];
      for (let row = 0; row < 20 && multi.length === 0; row++) {
        const runs = [...shape.getRuns(3, row, [0, 19], slab)];
        if (runs.length >= 2) {
          multi.push(...runs);
        }
      }
      for (let index = 0; index + 1 < multi.length; index++) {
        expect(multi[index][1]).toBeLessThan(multi[index + 1][0]);
      }
    });

    it('excludes the notch of the U', () => {
      const shape = createContourShape({
        volume,
        planePoint,
        normal: AXIAL,
        polyline: uShape,
      });

      // A point inside the notch is outside the contour.
      expect(shape.containsPoint([9, 12, 3])).toBe(false);
      // A point in an arm is inside it.
      expect(shape.containsPoint([4, 12, 3])).toBe(true);
      // A point in the base is inside it.
      expect(shape.containsPoint([9, 4, 3])).toBe(true);
    });
  });

  it('defaults its required thickness to one voxel', () => {
    const shape = createContourShape({
      volume,
      planePoint,
      normal: AXIAL,
      polyline: square(10, 10, 3, 3),
    });
    expect(shape.getRequiredThickness()).toBeCloseTo(1, 10);
  });

  it('reports the depth it was given', () => {
    const shape = createContourShape({
      volume,
      planePoint,
      normal: AXIAL,
      polyline: square(10, 10, 3, 3),
      depth: 4,
    });
    expect(shape.getRequiredThickness()).toBe(4);
  });

  it('spans the layers its depth implies', () => {
    const cube = createSyntheticVolume({
      dimensions: [20, 20, 16],
      spacing: [1, 1, 1],
    });
    const anchor = [10, 10, 8];
    const shape = createContourShape({
      volume: cube,
      planePoint: anchor,
      normal: AXIAL,
      polyline: square(10, 10, 3.5, 8),
      depth: 4,
    });

    const voxels = expectShapeConsistency({
      volume: cube,
      planePoint: anchor,
      normal: AXIAL,
      annotationThickness: shape.getRequiredThickness(),
      shape,
    });

    // T = 4, T_v = 1, so d = 2.5 and layers 6..10 qualify.
    expect(
      [...new Set(voxels.map(([, , k]) => k))].sort((a, b) => a - b)
    ).toEqual([6, 7, 8, 9, 10]);
  });

  it('agrees at oblique angles', () => {
    const oblique = createSyntheticVolume({
      dimensions: [18, 18, 12],
      spacing: [1, 1, 2.5],
    });

    [12, 30, 50, 70].forEach((degrees) => {
      const normal = obliqueNormal(oblique.direction, degrees);
      const anchor = [9, 9, 15];

      // A hexagon in the annotation plane, built from the plane's own basis so
      // it genuinely lies in the oblique plane.
      const { u, v } = createPlaneBasis(normal, [1, 0, 0]);
      const polyline = [];
      for (let corner = 0; corner < 6; corner++) {
        const angle = (corner / 6) * 2 * Math.PI;
        const radius = 5;
        polyline.push([
          anchor[0] +
            radius * (Math.cos(angle) * u[0] + Math.sin(angle) * v[0]),
          anchor[1] +
            radius * (Math.cos(angle) * u[1] + Math.sin(angle) * v[1]),
          anchor[2] +
            radius * (Math.cos(angle) * u[2] + Math.sin(angle) * v[2]),
        ]);
      }

      expectShapeConsistency(
        {
          volume: oblique,
          planePoint: anchor,
          normal,
          annotationThickness: getVoxelThicknessAlongNormal(oblique, normal),
          shape: createContourShape({
            volume: oblique,
            planePoint: anchor,
            normal,
            polyline,
          }),
        },
        `hexagon at ${degrees} degrees`
      );
    });
  });

  it('approximates a circle as the vertex count rises', () => {
    const anchor = [10, 10, 3];
    const circle = createCircleShape({
      volume,
      planePoint: anchor,
      normal: AXIAL,
      center: anchor,
      radius: 6,
    });

    const polygonOf = (sides) => {
      const polyline = [];
      for (let corner = 0; corner < sides; corner++) {
        const angle = (corner / sides) * 2 * Math.PI;
        polyline.push([
          anchor[0] + 6 * Math.cos(angle),
          anchor[1] + 6 * Math.sin(angle),
          anchor[2],
        ]);
      }
      return createContourShape({
        volume,
        planePoint: anchor,
        normal: AXIAL,
        polyline,
      });
    };

    const options = {
      volume,
      planePoint: anchor,
      normal: AXIAL,
      annotationThickness: 1,
    };
    const circleCount = collectVoxelsInSlab({
      ...options,
      getShapeRuns: circle.getRuns,
    }).length;

    const coarse = collectVoxelsInSlab({
      ...options,
      getShapeRuns: polygonOf(6).getRuns,
    }).length;
    const fine = collectVoxelsInSlab({
      ...options,
      getShapeRuns: polygonOf(64).getRuns,
    }).length;

    expect(coarse).toBeLessThan(circleCount);
    expect(Math.abs(fine - circleCount)).toBeLessThan(
      Math.abs(coarse - circleCount)
    );
  });
});
