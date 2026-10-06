import type { Types } from '@cornerstonejs/core';
import { utilities as csUtils } from '@cornerstonejs/core';

import type { ContourFillOptions } from '../utils/contourVoxelSlab';
import { iterateContourFillVoxels } from '../utils/contourVoxelSlab';

const { getVoxelThicknessAlongNormal, signedDistanceToPlane } =
  csUtils.voxelSlab;

const IDENTITY_DIRECTION = [1, 0, 0, 0, 1, 0, 0, 0, 1] as Types.Mat3;

/**
 * Just enough of a labelmap's geometry for the fill, which reads the four
 * geometry fields and `worldToIndex`. Modelled on the fixture in
 * `brushVoxelSlab.spec.ts`, so the two fills are tested against the same grid.
 */
function makeVolume(
  dimensions: Types.Point3,
  {
    spacing = [1, 1, 1] as Types.Point3,
    direction = IDENTITY_DIRECTION,
    origin = [0, 0, 0] as Types.Point3,
  } = {}
) {
  const iVector = direction.slice(0, 3);
  const jVector = direction.slice(3, 6);
  const kVector = direction.slice(6, 9);

  const volume = { dimensions, direction, spacing, origin };

  const imageData = {
    // The direction rows are orthonormal, so the inverse is the transpose
    // divided by the spacing.
    worldToIndex: (world: Types.Point3) => {
      const offset = [
        world[0] - origin[0],
        world[1] - origin[1],
        world[2] - origin[2],
      ];
      return [iVector, jVector, kVector].map(
        (axisVector, axis) =>
          (offset[0] * axisVector[0] +
            offset[1] * axisVector[1] +
            offset[2] * axisVector[2]) /
          spacing[axis]
      ) as Types.Point3;
    },
  };

  const indexToWorld = (ijk: Types.Point3): Types.Point3 => {
    const world = [0, 0, 0] as Types.Point3;
    for (let axis = 0; axis < 3; axis++) {
      world[axis] =
        origin[axis] +
        ijk[0] * spacing[0] * iVector[axis] +
        ijk[1] * spacing[1] * jVector[axis] +
        ijk[2] * spacing[2] * kVector[axis];
    }
    return world;
  };

  return { volume, imageData, indexToWorld };
}

/**
 * Every voxel the fill writes, in visit order.
 *
 * The copy inside the loop is required, and not a precaution.
 * `iterateContourFillVoxels` yields one buffer and writes over it at every
 * step, so collecting the yielded value itself gives N references to the last
 * index.
 */
function collect(options: ContourFillOptions): Types.Point3[] {
  const filled: Types.Point3[] = [];

  for (const ijk of iterateContourFillVoxels(options)) {
    filled.push([...ijk] as Types.Point3);
  }

  return filled;
}

/** A key per voxel, so duplicates and set equality are both visible. */
const keys = (filled: Types.Point3[]) => filled.map((ijk) => ijk.join(','));

/** The distinct index values along one axis, sorted. */
const axisLayers = (filled: Types.Point3[], axis: 0 | 1 | 2) =>
  [...new Set(filled.map((ijk) => ijk[axis]))].sort((a, b) => a - b);

/** A unit normal `degrees` away from the k axis, rotated towards i. */
function obliqueNormal(degrees: number): Types.Point3 {
  const radians = (degrees * Math.PI) / 180;
  return [Math.sin(radians), 0, Math.cos(radians)];
}

/**
 * A square contour of half width `halfWidth`, centred on `center` and lying in
 * the plane that `right` and `up` span. Walked in order, so the four points
 * describe the perimeter and not a bow-tie.
 */
function squareContour(
  center: Types.Point3,
  right: Types.Point3,
  up: Types.Point3,
  halfWidth: number
): Types.Point3[] {
  const corner = (a: number, b: number): Types.Point3 => [
    center[0] + (a * right[0] + b * up[0]) * halfWidth,
    center[1] + (a * right[1] + b * up[1]) * halfWidth,
    center[2] + (a * right[2] + b * up[2]) * halfWidth,
  ];

  return [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
}

describe('iterateContourFillVoxels', () => {
  const dimensions: Types.Point3 = [24, 24, 24];
  const AXIAL_NORMAL: Types.Point3 = [0, 0, 1];
  const RIGHT: Types.Point3 = [1, 0, 0];
  const UP: Types.Point3 = [0, 1, 0];

  describe('an axis-aligned contour', () => {
    const { volume, imageData } = makeVolume(dimensions);
    // k = 12 exactly, so the contour sits on a layer of voxel centres.
    const polyline = squareContour([12, 12, 12], RIGHT, UP, 4);
    const filled = collect({
      volume,
      polyline,
      viewPlaneNormal: AXIAL_NORMAL,
      imageData,
    });

    it('writes one layer of voxels, on the contour plane', () => {
      expect(filled.length).toBeGreaterThan(0);
      expect(axisLayers(filled, 2)).toEqual([12]);
    });

    it('writes no voxel two times', () => {
      expect(keys(filled).length).toBe(new Set(keys(filled)).size);
    });

    it('fills the area the contour encloses', () => {
      // A square of half width 4 on a unit grid covers the voxel centres from
      // 8 to 16 along each in-plane axis, which is 9 x 9 voxels.
      expect(filled.length).toBe(9 * 9);
      expect(axisLayers(filled, 0)).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16]);
      expect(axisLayers(filled, 1)).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16]);
    });
  });

  /**
   * Rule F, and the defect that Rule M produces.
   *
   * A contour at k = 12.5 lies exactly midway between the voxel layers k = 12
   * and k = 13. Rule M widens the slab by half a voxel on each side, so both
   * layers qualify and the fill writes two layers for a contour that the user
   * drew on one. Rule F takes only the voxels whose centre the slab holds, so
   * the fill writes one layer.
   */
  describe('a contour midway between two voxel layers', () => {
    const { volume, imageData } = makeVolume(dimensions);
    const filled = collect({
      volume,
      polyline: squareContour([12, 12, 12.5], RIGHT, UP, 4),
      viewPlaneNormal: AXIAL_NORMAL,
      imageData,
    });

    it('writes exactly one layer, and not both neighbours', () => {
      const layers = axisLayers(filled, 2);

      expect(layers.length).toBe(1);
      // Either neighbour is correct. Writing both is the Rule M defect.
      expect([12, 13]).toContain(layers[0]);
    });

    it('writes the same number of voxels as a contour on a layer', () => {
      expect(filled.length).toBe(9 * 9);
    });
  });

  /**
   * Consecutive contours tile: every voxel belongs to exactly one of them.
   *
   * This is the second half of Rule F. Under Rule M the layer between two
   * neighbouring contours belongs to both, so each of the two records an undo
   * entry for that layer.
   */
  describe('contours on consecutive frames', () => {
    const { volume, imageData } = makeVolume(dimensions);

    const fillAt = (k: number) =>
      keys(
        collect({
          volume,
          polyline: squareContour([12, 12, k], RIGHT, UP, 4),
          viewPlaneNormal: AXIAL_NORMAL,
          imageData,
        })
      );

    it('share no voxel', () => {
      const first = fillAt(12);
      const second = fillAt(13);

      expect(first.length).toBeGreaterThan(0);
      expect(second.length).toBeGreaterThan(0);

      const shared = first.filter((key) => second.includes(key));
      expect(shared).toEqual([]);
    });

    it('cover both layers between them', () => {
      const covered = new Set([...fillAt(12), ...fillAt(13)]);

      expect(covered.size).toBe(2 * 9 * 9);
    });
  });

  /**
   * The case this branch fixes. An oblique contour has no shared i, j or k
   * value across its points, so the plane cuts the voxel grid at an angle.
   */
  describe('an oblique contour', () => {
    const { volume, imageData, indexToWorld } = makeVolume(dimensions);

    // 30 degrees from the k axis, rotated towards i. `right` stays in that
    // plane, and `up` is the j axis, which the rotation does not move.
    const degrees = 30;
    const radians = (degrees * Math.PI) / 180;
    const viewPlaneNormal = obliqueNormal(degrees);
    const right: Types.Point3 = [Math.cos(radians), 0, -Math.sin(radians)];
    const polyline = squareContour([12, 12, 12], right, UP, 5);
    const filled = collect({
      volume,
      polyline,
      viewPlaneNormal,
      imageData,
    });

    it('fills voxels', () => {
      expect(filled.length).toBeGreaterThan(0);
    });

    it('spans more than one k layer, because the plane is oblique', () => {
      expect(axisLayers(filled, 2).length).toBeGreaterThan(1);
    });

    it('writes no voxel two times', () => {
      expect(keys(filled).length).toBe(new Set(keys(filled)).size);
    });

    it('keeps every voxel centre within half a voxel of the contour plane', () => {
      // Rule F's half width for a fill one voxel deep is exactly
      // `voxelThickness / 2`, so no filled centre may sit further than that
      // from the plane. A depth tolerance that is too large bleeds the fill
      // into the neighbouring slices, and this assertion catches that.
      const voxelThickness = getVoxelThicknessAlongNormal(
        volume,
        viewPlaneNormal
      );
      const halfWidth = voxelThickness / 2;

      const distances = filled.map((ijk) =>
        Math.abs(
          signedDistanceToPlane(indexToWorld(ijk), polyline[0], viewPlaneNormal)
        )
      );

      expect(Math.max(...distances)).toBeLessThanOrEqual(halfWidth);
    });

    it('leaves no hole along the normal', () => {
      // A depth tolerance that is too small leaves holes in an oblique sheet.
      // The k layers the fill writes must therefore form one unbroken run.
      const layers = axisLayers(filled, 2);

      const isUnbroken = layers.every(
        (layer, index) => index === 0 || layer === layers[index - 1] + 1
      );

      expect(isUnbroken).toBe(true);
    });

    it('leaves no hole in the plane: every row of the sheet is continuous', () => {
      // For each (j, k) the fill must write a continuous run of i. A gap means
      // the sheet has a hole, which is the defect that a too small tolerance
      // produced on an oblique plane.
      const rows = new Map<string, number[]>();

      for (const [i, j, k] of filled) {
        const key = `${j},${k}`;
        rows.set(key, [...(rows.get(key) ?? []), i]);
      }

      for (const [, iValues] of rows) {
        const sorted = [...iValues].sort((a, b) => a - b);
        const isContinuous = sorted.every(
          (value, index) => index === 0 || value === sorted[index - 1] + 1
        );
        expect(isContinuous).toBe(true);
      }
    });
  });

  describe('a degenerate contour', () => {
    const { volume, imageData } = makeVolume(dimensions);

    it('fills nothing when the contour has fewer than three points', () => {
      const filled = collect({
        volume,
        polyline: [
          [10, 10, 12],
          [14, 10, 12],
        ] as Types.Point3[],
        viewPlaneNormal: AXIAL_NORMAL,
        imageData,
      });

      expect(filled).toEqual([]);
    });
  });

  /**
   * A non-unit spacing and a non-zero origin, because a real volume has both.
   * The fill must read the geometry and never assume a unit grid.
   */
  describe('an anisotropic volume with an offset origin', () => {
    const { volume, imageData } = makeVolume(dimensions, {
      spacing: [0.5, 0.5, 3] as Types.Point3,
      origin: [-40, -30, -20] as Types.Point3,
    });

    it('writes one layer of voxels', () => {
      // k = 5 in index space, which is world z = -20 + 5 * 3 = -5.
      const centerWorld: Types.Point3 = [-30, -20, -5];
      const filled = collect({
        volume,
        polyline: squareContour(centerWorld, RIGHT, UP, 2),
        viewPlaneNormal: AXIAL_NORMAL,
        imageData,
      });

      expect(filled.length).toBeGreaterThan(0);
      expect(axisLayers(filled, 2)).toEqual([5]);
    });
  });
});
