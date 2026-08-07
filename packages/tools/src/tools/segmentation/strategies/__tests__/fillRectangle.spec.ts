import type { Types } from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';

import { orderRectangleCorners } from '../fillRectangle';

/**
 * Returns the squared distance between two points. Used to avoid sqrt noise
 * when comparing edges versus diagonals.
 */
function dist2(a: Types.Point3, b: Types.Point3): number {
  return vec3.squaredDistance(a, b);
}

/**
 * A correctly ordered rectangle [q0, q1, q2, q3] walks the perimeter, so the
 * diagonals are (q0, q2) and (q1, q3). For any non-degenerate rectangle each
 * diagonal must be strictly longer than the two edges meeting at its
 * endpoints. If the ordering accidentally places two opposite corners next to
 * each other (a "bow-tie"), an edge becomes a diagonal and this check fails.
 */
function isProperWinding(ordered: Types.Point3[]): boolean {
  const [q0, q1, q2, q3] = ordered;

  const diag = dist2(q0, q2);
  const edgesFromQ0 = [dist2(q0, q1), dist2(q0, q3)];

  return edgesFromQ0.every((edge) => diag > edge);
}

/**
 * Describes the rectangle reconstructed from an ordered corner list the same
 * way the fill code does: the two edges leaving q0 are axisU = q1 - q0 and
 * axisV = q3 - q0. Returns the (orientation-independent) sorted side lengths
 * and the dot product of the two edges (0 for a true rectangle).
 */
function rectangleSignature(ordered: Types.Point3[]) {
  const [q0, q1, , q3] = ordered;
  const axisU = vec3.subtract(vec3.create(), q1, q0);
  const axisV = vec3.subtract(vec3.create(), q3, q0);

  return {
    sides: [vec3.length(axisU), vec3.length(axisV)].sort((a, b) => a - b),
    edgeDot: vec3.dot(axisU, axisV),
  };
}

describe('orderRectangleCorners', () => {
  it('orders an axial rectangle (constant Z) into proper winding', () => {
    // Plane parallel to world XY -> the historical world-XY sort happens to
    // work here, so this guards against regressions in the common case.
    const corners: Types.Point3[] = [
      [10, 20, 5],
      [50, 20, 5],
      [50, 40, 5],
      [10, 40, 5],
    ];

    const ordered = orderRectangleCorners(corners);

    expect(isProperWinding(ordered)).toBe(true);
  });

  it('orders a coronal rectangle (constant Y) into proper winding', () => {
    // Plane parallel to world XZ. World Y is constant for every corner, so an
    // ordering that sorts by atan2(y - cy, x - cx) collapses all angles onto
    // 0/PI and produces a self-intersecting bow-tie. This is the rotated-view
    // case from issue #2651.
    const corners: Types.Point3[] = [
      [10, 50, 100],
      [50, 50, 100],
      [50, 50, 120],
      [10, 50, 120],
    ];

    const ordered = orderRectangleCorners(corners);

    expect(isProperWinding(ordered)).toBe(true);
  });

  it('orders an oblique rectangle into proper winding regardless of input order', () => {
    // A rectangle rotated 45 degrees about the world Z axis, lifted in Z so it
    // does not lie in any world-aligned plane.
    const right = vec3.normalize(vec3.create(), [1, 1, 0]) as Types.Point3;
    const up = vec3.normalize(vec3.create(), [-1, 1, 1]) as Types.Point3;
    const origin: Types.Point3 = [30, 30, 30];

    const corner = (u: number, v: number): Types.Point3 =>
      [
        origin[0] + right[0] * u + up[0] * v,
        origin[1] + right[1] * u + up[1] * v,
        origin[2] + right[2] * u + up[2] * v,
      ] as Types.Point3;

    // Half extents: 40 along the in-plane right axis, 15 along up.
    const tl = corner(-40, 15);
    const tr = corner(40, 15);
    const br = corner(40, -15);
    const bl = corner(-40, -15);

    // Feed them in a scrambled order to prove the result is order-independent.
    const ordered = orderRectangleCorners([tr, bl, tl, br]);

    expect(isProperWinding(ordered)).toBe(true);
  });

  it('reconstructs the same rectangle when viewed from the opposite plane normal', () => {
    // The same physical corners traversed in the opposite winding order is
    // what an opposite view-plane normal produces. The derived in-plane basis
    // is geometric (not camera-based), so the reconstructed rectangle - its
    // side lengths and right angles - must be identical either way.
    const right = vec3.normalize(vec3.create(), [1, 1, 0]) as Types.Point3;
    const up = vec3.normalize(vec3.create(), [-1, 1, 1]) as Types.Point3;
    const origin: Types.Point3 = [30, 30, 30];

    const corner = (u: number, v: number): Types.Point3 =>
      [
        origin[0] + right[0] * u + up[0] * v,
        origin[1] + right[1] * u + up[1] * v,
        origin[2] + right[2] * u + up[2] * v,
      ] as Types.Point3;

    const corners = [
      corner(-40, 15),
      corner(40, 15),
      corner(40, -15),
      corner(-40, -15),
    ];

    const forward = orderRectangleCorners(corners);
    // Reversed winding == same corners seen from the opposite normal.
    const flipped = orderRectangleCorners([...corners].reverse());

    expect(isProperWinding(forward)).toBe(true);
    expect(isProperWinding(flipped)).toBe(true);

    const a = rectangleSignature(forward);
    const b = rectangleSignature(flipped);

    // Same rectangle dimensions and right angles regardless of orientation.
    expect(a.sides[0]).toBeCloseTo(b.sides[0], 6);
    expect(a.sides[1]).toBeCloseTo(b.sides[1], 6);
    expect(a.edgeDot).toBeCloseTo(0, 6);
    expect(b.edgeDot).toBeCloseTo(0, 6);
  });
});
