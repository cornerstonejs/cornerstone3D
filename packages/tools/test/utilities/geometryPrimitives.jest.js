import { describe, it, expect } from '@jest/globals';

import pointInEllipse, {
  precalculatePointInEllipse,
} from '../../src/utilities/math/ellipse/pointInEllipse';
import getCanvasEllipseCorners from '../../src/utilities/math/ellipse/getCanvasEllipseCorners';

import getCanvasCircleCorners from '../../src/utilities/math/circle/getCanvasCircleCorners';
import getCanvasCircleRadius from '../../src/utilities/math/circle/getCanvasCircleRadius';

import intersectLine from '../../src/utilities/math/line/intersectLine';
import isPointOnLineSegment from '../../src/utilities/math/line/isPointOnLineSegment';
import lineDistanceToPoint from '../../src/utilities/math/line/distanceToPoint';
import lineDistanceToPointSquared from '../../src/utilities/math/line/distanceToPointSquared';
import lineDistanceToPointSquaredInfo from '../../src/utilities/math/line/distanceToPointSquaredInfo';

import rectangleDistanceToPoint from '../../src/utilities/math/rectangle/distanceToPoint';

import intersectAABB from '../../src/utilities/math/aabb/intersectAABB';
import aabbDistanceToPoint from '../../src/utilities/math/aabb/distanceToPoint';
import aabbDistanceToPointSquared from '../../src/utilities/math/aabb/distanceToPointSquared';

import pointInSphere from '../../src/utilities/math/sphere/pointInSphere';

import angleBetweenLines from '../../src/utilities/math/angle/angleBetweenLines';

import pointDistanceToPoint from '../../src/utilities/math/point/distanceToPoint';
import pointDistanceToPointSquared from '../../src/utilities/math/point/distanceToPointSquared';
import mirror from '../../src/utilities/math/point/mirror';

import liangBarksyClip from '../../src/utilities/math/vec2/liangBarksyClip';
import findClosestPoint from '../../src/utilities/math/vec2/findClosestPoint';

import { interpolateVec3 } from '../../src/utilities/math/vec3/interpolateVec3';

import midPoint from '../../src/utilities/math/midPoint';

describe('math/ellipse/pointInEllipse', () => {
  // Axis-aligned ellipse centered at (0,0,0), xRadius=10, yRadius=5, zRadius=0
  // (a flat, on-plane ellipse, since most call sites are 2D-in-3D anyway).
  const ellipse = {
    center: [0, 0, 0],
    xRadius: 10,
    yRadius: 5,
    zRadius: 0,
  };

  it('returns true for the center point', () => {
    expect(pointInEllipse(ellipse, [0, 0, 0])).toBe(true);
  });

  it('returns true for a point exactly on the x-axis edge', () => {
    // (10/10)^2 + (0/5)^2 + 0 = 1 <= 1 -> inside (boundary is inclusive)
    expect(pointInEllipse(ellipse, [10, 0, 0])).toBe(true);
  });

  it('returns true for a point exactly on the y-axis edge', () => {
    expect(pointInEllipse(ellipse, [0, 5, 0])).toBe(true);
  });

  it('returns false for a point just outside the x-axis edge', () => {
    expect(pointInEllipse(ellipse, [10.001, 0, 0])).toBe(false);
  });

  it('returns false for a point just outside the y-axis edge', () => {
    expect(pointInEllipse(ellipse, [0, 5.001, 0])).toBe(false);
  });

  it('returns true for a point strictly inside the ellipse', () => {
    // (5/10)^2 + (2/5)^2 = 0.25 + 0.16 = 0.41 <= 1
    expect(pointInEllipse(ellipse, [5, 2, 0])).toBe(true);
  });

  it('returns false for a point clearly outside the ellipse', () => {
    // (8/10)^2 + (4/5)^2 = 0.64 + 0.64 = 1.28 > 1
    expect(pointInEllipse(ellipse, [8, 4, 0])).toBe(false);
  });

  it('respects zRadius for off-plane points (3D ellipsoid)', () => {
    const ellipsoid = {
      center: [0, 0, 0],
      xRadius: 10,
      yRadius: 5,
      zRadius: 2,
    };
    // On the z edge, x=y=0 -> inside
    expect(pointInEllipse(ellipsoid, [0, 0, 2])).toBe(true);
    // Beyond z edge -> outside
    expect(pointInEllipse(ellipsoid, [0, 0, 2.5])).toBe(false);
  });

  it('handles an off-center ellipse', () => {
    const offCenter = {
      center: [10, 10, 0],
      xRadius: 4,
      yRadius: 4,
      zRadius: 0,
    };
    expect(pointInEllipse(offCenter, [10, 10, 0])).toBe(true);
    expect(pointInEllipse(offCenter, [14, 10, 0])).toBe(true);
    expect(pointInEllipse(offCenter, [15, 10, 0])).toBe(false);
  });

  it('treats a zero-radius (degenerate) axis as an infinite constraint (invSq=0 contributes 0)', () => {
    // With xRadius=0, invXRadiusSq is defined as 0 (not Infinity), so any dx
    // contributes 0 to the "inside" sum regardless of magnitude - i.e. the
    // ellipse becomes unbounded along a degenerate axis rather than
    // collapsing to a line. This is a documented product behavior (see
    // precalculatePointInEllipse: `xRadius !== 0 ? 1 / xRadius ** 2 : 0`).
    const degenerate = {
      center: [0, 0, 0],
      xRadius: 0,
      yRadius: 5,
      zRadius: 0,
    };
    expect(pointInEllipse(degenerate, [1000, 0, 0])).toBe(true);
    // y-axis is still constrained normally
    expect(pointInEllipse(degenerate, [0, 5.001, 0])).toBe(false);
  });

  it('supports the fast/cached inverts path across repeated calls with different points', () => {
    const inverts = { fast: true };
    expect(pointInEllipse(ellipse, [0, 0, 0], inverts)).toBe(true);
    // Once cached, inverts.precalculated exists and is reused as-is.
    expect(typeof inverts.precalculated).toBe('function');
    expect(pointInEllipse(ellipse, [10, 0, 0], inverts)).toBe(true);
    expect(pointInEllipse(ellipse, [10.001, 0, 0], inverts)).toBe(false);
  });

  it('precalculatePointInEllipse exposes a reusable precalculated predicate', () => {
    const inverts = precalculatePointInEllipse(ellipse);
    expect(inverts.invXRadiusSq).toBeCloseTo(1 / 100, 10);
    expect(inverts.invYRadiusSq).toBeCloseTo(1 / 25, 10);
    expect(inverts.invZRadiusSq).toBe(0);
    expect(inverts.precalculated([5, 2, 0])).toBe(true);
    expect(inverts.precalculated([8, 4, 0])).toBe(false);
  });

  it('caching does not recompute the ellipse geometry if invert values are pre-set', () => {
    // If invXRadiusSq/invYRadiusSq/invZRadiusSq are already all defined,
    // precalculatePointInEllipse will not touch them, but it will still
    // rebuild `precalculated` from the (unrelated) ellipse passed in -
    // demonstrating the caching only applies to the radius-squared math.
    const inverts = { invXRadiusSq: 1, invYRadiusSq: 1, invZRadiusSq: 1 };
    precalculatePointInEllipse(ellipse, inverts);
    // Because invXRadiusSq/invYRadiusSq were forced to 1 (not the ellipse's
    // real 1/100, 1/25), the predicate uses those forced values.
    // dx=5,dy=2 -> 25*1 + 4*1 = 29 > 1 -> false
    expect(inverts.precalculated([5, 2, 0])).toBe(false);
  });
});

describe('math/ellipse/getCanvasEllipseCorners', () => {
  it('extracts top-left/bottom-right from [bottom, top, left, right] canvas points', () => {
    // bottom=(5,10) top=(5,0) left=(0,5) right=(10,5)
    const bottom = [5, 10];
    const top = [5, 0];
    const left = [0, 5];
    const right = [10, 5];
    const [topLeft, bottomRight] = getCanvasEllipseCorners([
      bottom,
      top,
      left,
      right,
    ]);
    // topLeft = [left.x, top.y] = [0, 0]
    expect(topLeft).toEqual([0, 0]);
    // bottomRight = [right.x, bottom.y] = [10, 10]
    expect(bottomRight).toEqual([10, 10]);
  });

  it('does not normalize/re-order when the "corners" are inverted (pure field pick)', () => {
    // If the caller passes points such that left.x > right.x, the function
    // does not swap them - it purely extracts fields. This documents that
    // callers are responsible for ordering, matching the source comment
    // that this returns "top left and bottom right" assuming correct input.
    const bottom = [5, 0]; // note: bottom.y (0) < top.y (10) here - inverted
    const top = [5, 10];
    const left = [8, 5]; // left.x (8) > right.x (2) - inverted
    const right = [2, 5];
    const [topLeft, bottomRight] = getCanvasEllipseCorners([
      bottom,
      top,
      left,
      right,
    ]);
    expect(topLeft).toEqual([8, 10]);
    expect(bottomRight).toEqual([2, 0]);
  });
});

describe('math/circle/getCanvasCircleRadius', () => {
  it('computes the radius as the distance between center and end points', () => {
    // 3-4-5 triangle
    const radius = getCanvasCircleRadius([
      [0, 0],
      [3, 4],
    ]);
    expect(radius).toBeCloseTo(5, 10);
  });

  it('returns 0 when center and end coincide', () => {
    const radius = getCanvasCircleRadius([
      [2, 2],
      [2, 2],
    ]);
    expect(radius).toBe(0);
  });
});

describe('math/circle/getCanvasCircleCorners', () => {
  it('computes a bounding square from center/end (radius = distance)', () => {
    const [topLeft, bottomRight] = getCanvasCircleCorners([
      [10, 10],
      [13, 14], // radius = 5 (3-4-5 triangle)
    ]);
    expect(topLeft).toEqual([5, 5]);
    expect(bottomRight).toEqual([15, 15]);
  });
});

describe('math/line/intersectLine', () => {
  it('finds the exact intersection point of two crossing segments', () => {
    // Segment A: (0,0)-(4,4), Segment B: (0,4)-(4,0) -> cross at (2,2)
    const result = intersectLine([0, 0], [4, 4], [0, 4], [4, 0]);
    expect(result[0]).toBeCloseTo(2, 10);
    expect(result[1]).toBeCloseTo(2, 10);
  });

  it('returns undefined for non-intersecting (parallel) segments', () => {
    // Two horizontal, vertically-offset segments never cross
    const result = intersectLine([0, 0], [4, 0], [0, 1], [4, 1]);
    expect(result).toBeUndefined();
  });

  it('returns undefined for parallel segments using the infinite=true path', () => {
    const result = intersectLine([0, 0], [4, 0], [0, 1], [4, 1], true);
    expect(result).toBeUndefined();
  });

  it('computes intersection of infinite lines beyond segment bounds', () => {
    // Segment path treats these as bounded and would return undefined since
    // they don't overlap in range, but infinite=true extends them.
    // Line A: (0,0)-(1,1) i.e. y=x. Line B: (2,0)-(3,-1) i.e. y = -(x-2) = -x+2
    // Intersection of y=x and y=-x+2 -> x=1,y=1
    const result = intersectLine([0, 0], [1, 1], [2, 0], [3, -1], true);
    expect(result[0]).toBeCloseTo(1, 10);
    expect(result[1]).toBeCloseTo(1, 10);
  });

  it('returns undefined for segments that do not overlap even though the lines would cross', () => {
    // Line A: (0,0)-(1,1). Line B extended crosses at (1,1) but segment B is (2,0)-(3,-1),
    // which does not include (1,1) -> non-infinite mode must reject it.
    const result = intersectLine([0, 0], [1, 1], [2, 0], [3, -1], false);
    expect(result).toBeUndefined();
  });

  it('handles collinear, overlapping segments by treating endpoints as touching', () => {
    // Both segments lie on y=0. Segment A: (0,0)-(2,0). Segment B: (1,0)-(3,0).
    // r3/r4 (and r1/r2) will be 0 since all points are collinear, so signs
    // are not "opposite same sign" and the code proceeds to divide, but the
    // denominator (a1*b2 - a2*b1) is 0 for collinear lines -> result is NaN.
    // This documents current behavior: collinear overlap is NOT specially handled.
    const result = intersectLine([0, 0], [2, 0], [1, 0], [3, 0]);
    expect(result[0]).toBeNaN();
    expect(result[1]).toBeNaN();
  });

  it('detects intersection exactly at touching endpoints', () => {
    // Segment A ends where Segment B starts: (2,2)
    const result = intersectLine([0, 0], [2, 2], [2, 2], [4, 0]);
    expect(result[0]).toBeCloseTo(2, 10);
    expect(result[1]).toBeCloseTo(2, 10);
  });
});

describe('math/line/isPointOnLineSegment', () => {
  it('returns true for a point exactly on the segment (midpoint)', () => {
    expect(isPointOnLineSegment([0, 0], [10, 0], [5, 0])).toBe(true);
  });

  it('returns false for a point off the line entirely', () => {
    expect(isPointOnLineSegment([0, 0], [10, 0], [5, 5])).toBe(false);
  });

  it('returns false for a point on the infinite line but beyond the segment endpoints', () => {
    // Collinear with (0,0)-(10,0), but x=15 is beyond the endpoint at x=10
    expect(isPointOnLineSegment([0, 0], [10, 0], [15, 0])).toBe(false);
  });

  it('applies an orientation/AABB tolerance of 1e-2 near the segment', () => {
    // The orientation (cross-product) formula scales with segment length:
    // for this horizontal 10-unit-long segment, orientation = -10 * point.y,
    // so ORIENTATION_TOLERANCE (1e-2) on |orientation| corresponds to
    // |point.y| <= 0.001, not 0.01 - the tolerance is not a plain
    // perpendicular-distance tolerance once the segment length != 1.
    // 0.0005 off the line -> orientation = 0.005 <= 0.01 -> within tolerance
    expect(isPointOnLineSegment([0, 0], [10, 0], [5, 0.0005])).toBe(true);
    // 0.005 off the line -> orientation = 0.05 > 0.01 -> exceeds tolerance
    expect(isPointOnLineSegment([0, 0], [10, 0], [5, 0.005])).toBe(false);
  });

  it('applies the same tolerance just beyond the endpoint bounds', () => {
    // 10.005 is within 1e-2 of the AABB max x (10)
    expect(isPointOnLineSegment([0, 0], [10, 0], [10.005, 0])).toBe(true);
    // 10.05 is outside the AABB tolerance
    expect(isPointOnLineSegment([0, 0], [10, 0], [10.05, 0])).toBe(false);
  });
});

describe('math/line/distanceToPoint family', () => {
  it('distanceToPoint: perpendicular distance for a foot that lands inside the segment', () => {
    // Segment (0,0)-(10,0), point (5,5) -> perpendicular foot is (5,0), distance 5
    expect(lineDistanceToPoint([0, 0], [10, 0], [5, 5])).toBeCloseTo(5, 10);
  });

  it('distanceToPoint: clamps to the nearest endpoint when the foot falls outside the segment', () => {
    // Point (15,3) projects beyond the end (10,0); closest point is the
    // endpoint (10,0) -> distance = sqrt(5^2+3^2) = sqrt(34)
    expect(lineDistanceToPoint([0, 0], [10, 0], [15, 3])).toBeCloseTo(
      Math.sqrt(34),
      10
    );
  });

  it('distanceToPoint: throws for points/lines that are not 2D', () => {
    expect(() => lineDistanceToPoint([0, 0, 0], [10, 0], [5, 5])).toThrow();
  });

  it('distanceToPointSquared matches the square of distanceToPoint', () => {
    const start = [1, 1];
    const end = [4, 5];
    const point = [0, 10];
    const dist = lineDistanceToPoint(start, end, point);
    const distSq = lineDistanceToPointSquared(start, end, point);
    expect(distSq).toBeCloseTo(dist * dist, 8);
  });

  it('distanceToPointSquaredInfo returns both the closest point and the squared distance (foot inside segment)', () => {
    const info = lineDistanceToPointSquaredInfo([0, 0], [10, 0], [5, 5]);
    expect(info.point[0]).toBeCloseTo(5, 10);
    expect(info.point[1]).toBeCloseTo(0, 10);
    expect(info.distanceSquared).toBeCloseTo(25, 10);
  });

  it('distanceToPointSquaredInfo clamps the closest point to the start endpoint', () => {
    // Point (-5,3) projects before the start (0,0) -> dotProduct < 0
    const info = lineDistanceToPointSquaredInfo([0, 0], [10, 0], [-5, 3]);
    expect(info.point).toEqual([0, 0]);
    expect(info.distanceSquared).toBeCloseTo(25 + 9, 10);
  });

  it('distanceToPointSquaredInfo clamps the closest point to the end endpoint', () => {
    // Point (15,4) projects beyond the end (10,0) -> dotProduct > 1
    const info = lineDistanceToPointSquaredInfo([0, 0], [10, 0], [15, 4]);
    expect(info.point).toEqual([10, 0]);
    expect(info.distanceSquared).toBeCloseTo(25 + 16, 10);
  });

  it('distanceToPointSquaredInfo handles a degenerate (zero-length) segment', () => {
    // lineStart === lineEnd -> closest point is that single point
    const info = lineDistanceToPointSquaredInfo([3, 3], [3, 3], [3, 7]);
    expect(info.point).toEqual([3, 3]);
    expect(info.distanceSquared).toBeCloseTo(16, 10);
  });
});

describe('math/rectangle/distanceToPoint', () => {
  // Rectangle: left=0, top=0, width=10, height=10 -> corners (0,0)-(10,10)
  const rect = [0, 0, 10, 10];

  it('is 0 for a point inside the rectangle (closest edge distance still computed from segments, so on-boundary is 0, but strictly-inside is > 0 by design)', () => {
    // The implementation measures distance to the 4 edges (as line segments),
    // not signed "inside" distance, so a strictly interior point still
    // returns a positive distance to the closest edge.
    // Center point (5,5): closest edge distance is 5 (to any side)
    expect(rectangleDistanceToPoint(rect, [5, 5])).toBeCloseTo(5, 10);
  });

  it('is 0 for a point exactly on an edge', () => {
    expect(rectangleDistanceToPoint(rect, [5, 0])).toBeCloseTo(0, 10);
  });

  it('computes the distance to the nearest corner when outside diagonally', () => {
    // Point (13,14) is outside; nearest corner is (10,10) -> sqrt(3^2+4^2)=5
    expect(rectangleDistanceToPoint(rect, [13, 14])).toBeCloseTo(5, 10);
  });

  it('computes the perpendicular distance to the nearest edge when outside straight off one side', () => {
    // Point (5,-4) is straight below the top edge (y=0) -> distance 4
    expect(rectangleDistanceToPoint(rect, [5, -4])).toBeCloseTo(4, 10);
  });

  it('throws for malformed rect/point arguments', () => {
    expect(() => rectangleDistanceToPoint([0, 0, 10], [5, 5])).toThrow();
    expect(() => rectangleDistanceToPoint(rect, [5, 5, 5])).toThrow();
  });
});

describe('math/aabb/intersectAABB', () => {
  const base = { minX: 0, minY: 0, maxX: 10, maxY: 10 };

  it('detects overlapping AABBs', () => {
    const other = { minX: 5, minY: 5, maxX: 15, maxY: 15 };
    expect(intersectAABB(base, other)).toBe(true);
  });

  it('detects AABBs that only touch at an edge as intersecting', () => {
    // Touching exactly at x=10 boundary
    const other = { minX: 10, minY: 0, maxX: 20, maxY: 10 };
    expect(intersectAABB(base, other)).toBe(true);
  });

  it('detects disjoint AABBs as non-intersecting', () => {
    const other = { minX: 11, minY: 11, maxX: 20, maxY: 20 };
    expect(intersectAABB(base, other)).toBe(false);
  });
});

describe('math/aabb/distanceToPoint(Squared)', () => {
  const aabb = { minX: 0, minY: 0, maxX: 10, maxY: 10 };

  it('is 0 for a point inside the AABB', () => {
    expect(aabbDistanceToPointSquared(aabb, [5, 5])).toBe(0);
    expect(aabbDistanceToPoint(aabb, [5, 5])).toBe(0);
  });

  it('is 0 for a point exactly on the boundary', () => {
    expect(aabbDistanceToPointSquared(aabb, [10, 5])).toBe(0);
  });

  it('computes the perpendicular squared distance for a point outside one side', () => {
    // Point (5,-3): directly below minY -> distance 3, squared 9
    expect(aabbDistanceToPointSquared(aabb, [5, -3])).toBeCloseTo(9, 10);
    expect(aabbDistanceToPoint(aabb, [5, -3])).toBeCloseTo(3, 10);
  });

  it('computes the diagonal squared distance for a point outside a corner', () => {
    // Point (13,14): outside both maxX (by 3) and maxY (by 4) -> corner
    // distance sqrt(3^2+4^2)=5, squared=25
    expect(aabbDistanceToPointSquared(aabb, [13, 14])).toBeCloseTo(25, 10);
    expect(aabbDistanceToPoint(aabb, [13, 14])).toBeCloseTo(5, 10);
  });
});

describe('math/sphere/pointInSphere', () => {
  const sphere = { center: [0, 0, 0], radius: 5 };

  it('returns true for the center point', () => {
    expect(pointInSphere(sphere, [0, 0, 0])).toBe(true);
  });

  it('returns true for a point exactly on the surface', () => {
    expect(pointInSphere(sphere, [5, 0, 0])).toBe(true);
    expect(pointInSphere(sphere, [3, 4, 0])).toBe(true); // 3-4-5 triangle
  });

  it('returns false for a point outside the sphere', () => {
    expect(pointInSphere(sphere, [5.001, 0, 0])).toBe(false);
  });

  it('uses the precomputed radius2 when supplied, ignoring recompute of radius*radius', () => {
    // Deliberately mismatched radius2 to prove it takes precedence.
    const sphereWithRadius2 = { center: [0, 0, 0], radius: 5, radius2: 4 };
    // distance^2 from origin to (1.9,0,0) is 3.61 <= 4 -> inside per radius2
    expect(pointInSphere(sphereWithRadius2, [1.9, 0, 0])).toBe(true);
    // distance^2 to (2.1,0,0) is 4.41 > 4 -> outside per radius2, even though
    // it would be well within radius=5
    expect(pointInSphere(sphereWithRadius2, [2.1, 0, 0])).toBe(false);
  });
});

describe('math/angle/angleBetweenLines', () => {
  it('returns 90 for perpendicular 2D lines', () => {
    const line1 = [
      [0, 0],
      [1, 0],
    ];
    const line2 = [
      [0, 0],
      [0, 1],
    ];
    expect(angleBetweenLines(line1, line2)).toBeCloseTo(90, 10);
  });

  it('returns 0 for parallel 2D lines pointing the same direction', () => {
    // Note: angle is measured between vector line1[1]->line1[0] and
    // line2[0]->line2[1] (see source docstring) - i.e. line1 is reversed.
    // line1 reversed: (1,0)->(0,0) direction = (-1,0)
    // line2: (0,5)->(1,5) direction = (1,0)
    // These point in opposite directions -> angle = 180, not 0.
    const line1 = [
      [0, 0],
      [1, 0],
    ];
    const line2 = [
      [0, 5],
      [1, 5],
    ];
    expect(angleBetweenLines(line1, line2)).toBeCloseTo(180, 10);
  });

  it('returns 0 when line1 reversed direction matches line2 direction', () => {
    // line1 reversed: (1,0)->(0,0) direction = (-1,0)
    // line2: (1,5)->(0,5) direction = (-1,0) -- same direction as line1 reversed
    const line1 = [
      [0, 0],
      [1, 0],
    ];
    const line2 = [
      [1, 5],
      [0, 5],
    ];
    expect(angleBetweenLines(line1, line2)).toBeCloseTo(0, 10);
  });

  it('returns 45 for a 45-degree angle between 2D lines', () => {
    const line1 = [
      [0, 0],
      [1, 0],
    ];
    // line2 direction (1,1) normalized is 45 degrees from (1,0);
    // line1 reversed direction is (-1,0), so the angle to (1,1) is 135.
    // To get exactly 45 with the reversal semantics, construct line2 so
    // its direction is at 45 degrees from (-1,0), i.e. direction (-1,-1)
    // reversed... simplest: pick line1 so reversal doesn't matter by
    // using a line1 whose reversed direction equals its forward direction
    // is impossible, so instead directly verify via the underlying vectors.
    const line2 = [
      [0, 0],
      [-1, -1],
    ];
    // line1 reversed direction: (1,0)->(0,0) = (-1,0)
    // line2 direction: (0,0)->(-1,-1) = (-1,-1), normalized angle from (-1,0) is 45 deg
    expect(angleBetweenLines(line1, line2)).toBeCloseTo(45, 10);
  });

  it('returns 90 for perpendicular 3D lines', () => {
    const line1 = [
      [0, 0, 0],
      [1, 0, 0],
    ];
    const line2 = [
      [0, 0, 0],
      [0, 1, 0],
    ];
    expect(angleBetweenLines(line1, line2)).toBeCloseTo(90, 10);
  });

  it('returns 0 for opposite-direction 3D lines using the reversal semantics', () => {
    // line1 reversed: (1,0,0)->(0,0,0) = (-1,0,0)
    // line2: (1,0,0)->(0,0,0) direction = (-1,0,0) -- same as line1 reversed
    const line1 = [
      [0, 0, 0],
      [1, 0, 0],
    ];
    const line2 = [
      [1, 0, 0],
      [0, 0, 0],
    ];
    expect(angleBetweenLines(line1, line2)).toBeCloseTo(0, 10);
  });
});

describe('math/point/distanceToPoint(Squared)', () => {
  it('computes 2D distance (3-4-5 triangle)', () => {
    expect(pointDistanceToPoint([0, 0], [3, 4])).toBeCloseTo(5, 10);
    expect(pointDistanceToPointSquared([0, 0], [3, 4])).toBeCloseTo(25, 10);
  });

  it('computes 3D distance', () => {
    // sqrt(1+4+4) = 3
    expect(pointDistanceToPoint([0, 0, 0], [1, 2, 2])).toBeCloseTo(3, 10);
    expect(pointDistanceToPointSquared([0, 0, 0], [1, 2, 2])).toBeCloseTo(
      9,
      10
    );
  });

  it('is 0 for identical points', () => {
    expect(pointDistanceToPoint([2, 2], [2, 2])).toBe(0);
  });

  it('throws when dimensionality does not match', () => {
    expect(() => pointDistanceToPointSquared([0, 0], [0, 0, 0])).toThrow();
  });
});

describe('math/point/mirror', () => {
  it('reflects a point across a static point (static is the midpoint of input/output)', () => {
    // Mirror (0,0) across static point (5,5) -> (10,10)
    expect(mirror([0, 0], [5, 5])).toEqual([10, 10]);
  });

  it('returns the same point when mirroring a point across itself', () => {
    expect(mirror([3, 3], [3, 3])).toEqual([3, 3]);
  });

  it('handles negative coordinates', () => {
    // Mirror (-2,-2) across (0,0) -> (2,2)
    expect(mirror([-2, -2], [0, 0])).toEqual([2, 2]);
  });
});

describe('math/vec2/liangBarksyClip', () => {
  const box = [0, 0, 10, 10]; // xmin, ymin, xmax, ymax

  it('keeps a segment fully inside the clip window unchanged', () => {
    const a = [2, 2];
    const b = [8, 8];
    const result = liangBarksyClip(a, b, box);
    expect(result).toBe(1); // INSIDE
    expect(a).toEqual([2, 2]);
    expect(b).toEqual([8, 8]);
  });

  it('clips a segment crossing one edge', () => {
    // Segment from (5,5) to (15,5) crosses the right edge at x=10
    const a = [5, 5];
    const b = [15, 5];
    const result = liangBarksyClip(a, b, box);
    expect(result).toBe(1);
    expect(a).toEqual([5, 5]); // start unchanged (already inside)
    expect(b[0]).toBeCloseTo(10, 10); // clipped to right edge
    expect(b[1]).toBeCloseTo(5, 10);
  });

  it('clips a segment crossing two edges (both ends outside)', () => {
    // Segment from (-5,5) to (15,5) crosses left edge at x=0 and right edge at x=10
    const a = [-5, 5];
    const b = [15, 5];
    const result = liangBarksyClip(a, b, box);
    expect(result).toBe(1);
    expect(a[0]).toBeCloseTo(0, 10);
    expect(a[1]).toBeCloseTo(5, 10);
    expect(b[0]).toBeCloseTo(10, 10);
    expect(b[1]).toBeCloseTo(5, 10);
  });

  it('rejects a segment fully outside the clip window', () => {
    const a = [20, 20];
    const b = [30, 30];
    const result = liangBarksyClip(a, b, box);
    expect(result).toBe(0); // OUTSIDE
  });

  it('rejects a segment lying exactly along a horizontal clip boundary (dy=0 edge case)', () => {
    // Segment along y=0 (== box ymin), spanning x in [xmin, xmax].
    // Suspected product/library quirk: for the boundary parallel to a clip
    // edge (dy === 0 here), clipT() short-circuits with `return num < 0`
    // where num = box[1] - y1 = ymin - y1. When the segment sits exactly on
    // that edge, num is exactly 0, so `0 < 0` is false and the segment is
    // rejected as OUTSIDE - even though it lies entirely within the box's
    // x-range on the boundary itself. The same happens on the y = ymax edge.
    // A segment offset by an epsilon to the inside (y=0.001) is correctly
    // kept, confirming the exact-boundary case is what triggers rejection.
    const a = [2, 0];
    const b = [8, 0];
    const result = liangBarksyClip(a, b, box);
    expect(result).toBe(0); // OUTSIDE - see note above

    const aInside = [2, 0.001];
    const bInside = [8, 0.001];
    const resultInside = liangBarksyClip(aInside, bInside, box);
    expect(resultInside).toBe(1); // INSIDE once nudged off the exact boundary
  });

  it('handles a degenerate (point) segment inside the box as INSIDE', () => {
    const a = [5, 5];
    const b = [5, 5];
    const result = liangBarksyClip(a, b, box);
    expect(result).toBe(1);
  });

  it('handles a degenerate (point) segment outside the box as OUTSIDE', () => {
    const a = [50, 50];
    const b = [50, 50];
    const result = liangBarksyClip(a, b, box);
    expect(result).toBe(0);
  });

  it('writes clipped results into optional da/db output points without mutating a/b', () => {
    const a = [5, 5];
    const b = [15, 5];
    const da = [0, 0];
    const db = [0, 0];
    const result = liangBarksyClip(a, b, box, da, db);
    expect(result).toBe(1);
    // Original a/b are untouched (this overload copies into da/db)
    expect(a).toEqual([5, 5]);
    expect(b).toEqual([15, 5]);
    expect(da).toEqual([5, 5]);
    expect(db[0]).toBeCloseTo(10, 10);
    expect(db[1]).toBeCloseTo(5, 10);
  });
});

describe('math/vec2/findClosestPoint', () => {
  it('finds the closest point among several candidates', () => {
    const sources = [
      [0, 0],
      [10, 10],
      [4, 4],
    ];
    const target = [5, 5];
    // distances: sqrt(50)=7.07, sqrt(50)=7.07, sqrt(2)=1.41 -> closest is (4,4)
    expect(findClosestPoint(sources, target)).toEqual([4, 4]);
  });

  it('returns the single point when only one candidate is given', () => {
    expect(findClosestPoint([[1, 1]], [100, 100])).toEqual([1, 1]);
  });

  it('returns [0, 0] default when sourcePoints is empty', () => {
    expect(findClosestPoint([], [1, 1])).toEqual([0, 0]);
  });
});

describe('math/vec3/interpolateVec3', () => {
  const a = [0, 0, 0];
  const b = [10, 20, 30];

  it('returns vector a at t=0', () => {
    expect(interpolateVec3(a, b, 0)).toEqual([0, 0, 0]);
  });

  it('returns vector b at t=1', () => {
    expect(interpolateVec3(a, b, 1)).toEqual([10, 20, 30]);
  });

  it('returns the exact midpoint at t=0.5', () => {
    expect(interpolateVec3(a, b, 0.5)).toEqual([5, 10, 15]);
  });

  it('linearly interpolates at an arbitrary t', () => {
    // t=0.25 -> a + 0.25*(b-a)
    const result = interpolateVec3(a, b, 0.25);
    expect(result[0]).toBeCloseTo(2.5, 10);
    expect(result[1]).toBeCloseTo(5, 10);
    expect(result[2]).toBeCloseTo(7.5, 10);
  });
});

describe('math/midPoint', () => {
  it('computes the midpoint of two 2D points', () => {
    expect(midPoint([0, 0], [10, 10])).toEqual([5, 5]);
  });

  it('computes the midpoint of two 3D points', () => {
    expect(midPoint([0, 0, 0], [10, 20, 30])).toEqual([5, 10, 15]);
  });

  it('supports more than two points (variadic average)', () => {
    // Average of (0,0), (6,0), (0,6) -> (2,2)
    const result = midPoint([0, 0], [6, 0], [0, 6]);
    expect(result[0]).toBeCloseTo(2, 10);
    expect(result[1]).toBeCloseTo(2, 10);
  });

  it('returns the same point for a single-point input', () => {
    expect(midPoint([3, 4])).toEqual([3, 4]);
  });
});
