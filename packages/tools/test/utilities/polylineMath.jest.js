/**
 * Unit tests for the "core" polyline math primitives that underpin freehand
 * ROI drawing and contour hit-testing:
 * predicates/metrics, segment-intersection helpers, convex hull, decimation,
 * 3D projection, and the robust segment intersection helper.
 *
 * NOTE on mocking: almost every module in `src/utilities/math/polyline`
 * imports only `import type { Types } from '@cornerstonejs/core'`, which is
 * erased at compile time by the TypeScript babel preset, so those modules
 * have zero runtime dependency on `@cornerstonejs/core` and need no mock at
 * all.
 *
 * `addCanvasPointsToArray.ts` is the one exception that truly needs the
 * heavy runtime registry: it calls `getEnabledElement()`, which looks up a
 * live RenderingEngine/viewport registered via `enable()` - something we do
 * not want to spin up (no canvas/WebGL mock is configured for this harness).
 * So we mock only `getEnabledElement` below, keeping every other real
 * `@cornerstonejs/core` export (this is safe/fast - confirmed empirically
 * that importing the real package in jsdom works fine for the pure-math
 * helpers used elsewhere in this file, e.g. `utilities.isEqual` and the
 * `StackViewport` class reference used for `instanceof` checks).
 */
jest.mock('@cornerstonejs/core', () => {
  const actual = jest.requireActual('@cornerstonejs/core');
  return {
    ...actual,
    getEnabledElement: jest.fn(),
  };
});

import { describe, it, expect } from '@jest/globals';
import { StackViewport, getEnabledElement } from '@cornerstonejs/core';

import containsPoint from '../../src/utilities/math/polyline/containsPoint';
import containsPoints from '../../src/utilities/math/polyline/containsPoints';
import getArea from '../../src/utilities/math/polyline/getArea';
import getSignedArea from '../../src/utilities/math/polyline/getSignedArea';
import getWindingDirection from '../../src/utilities/math/polyline/getWindingDirection';
import isClosed from '../../src/utilities/math/polyline/isClosed';
import getAABB from '../../src/utilities/math/polyline/getAABB';
import getNormal2 from '../../src/utilities/math/polyline/getNormal2';
import getNormal3 from '../../src/utilities/math/polyline/getNormal3';
import arePolylinesIdentical from '../../src/utilities/math/polyline/arePolylinesIdentical';
import getClosestLineSegmentIntersection from '../../src/utilities/math/polyline/getClosestLineSegmentIntersection';
import areLineSegmentsIntersecting from '../../src/utilities/math/polyline/areLineSegmentsIntersecting';
import { isPointInsidePolyline3D } from '../../src/utilities/math/polyline/isPointInsidePolyline3D';
import { projectTo2D } from '../../src/utilities/math/polyline/projectTo2D';
import convexHull from '../../src/utilities/math/polyline/convexHull';
import decimate from '../../src/utilities/math/polyline/decimate';
import getFirstLineSegmentIntersectionIndexes from '../../src/utilities/math/polyline/getFirstLineSegmentIntersectionIndexes';
import getLineSegmentIntersectionsIndexes from '../../src/utilities/math/polyline/getLineSegmentIntersectionsIndexes';
import getLineSegmentIntersectionsCoordinates from '../../src/utilities/math/polyline/getLineSegmentIntersectionsCoordinates';
import intersectPolyline from '../../src/utilities/math/polyline/intersectPolyline';
import pointCanProjectOnLine from '../../src/utilities/math/polyline/pointCanProjectOnLine';
import pointsAreWithinCloseContourProximity from '../../src/utilities/math/polyline/pointsAreWithinCloseContourProximity';
import {
  robustSegmentIntersection,
  pointsAreEqual,
} from '../../src/utilities/math/polyline/robustSegmentIntersection';
import getSubPixelSpacingAndXYDirections from '../../src/utilities/math/polyline/getSubPixelSpacingAndXYDirections';
import addCanvasPointsToArray from '../../src/utilities/math/polyline/addCanvasPointsToArray';

// A simple 10x10 axis-aligned square, CCW winding, open representation
// (first point not repeated at the end - the convention used throughout
// this codebase, e.g. `containsPoint`/`getArea`).
const square = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
];

describe('containsPoint', () => {
  it('returns true for a point strictly inside a square', () => {
    expect(containsPoint(square, [5, 5])).toBe(true);
  });

  it('returns false for a point strictly outside a square', () => {
    expect(containsPoint(square, [15, 15])).toBe(false);
  });

  it('returns false for polylines with fewer than 3 points', () => {
    expect(
      containsPoint(
        [
          [0, 0],
          [1, 1],
        ],
        [0, 0]
      )
    ).toBe(false);
  });

  // The ray-casting algorithm used here treats the boundary with a
  // "half-open" convention (a common trick to avoid double-counting shared
  // edges between adjacent polygons): points on the bottom/right edges are
  // "inside", but points on the top/left edges (and on vertices) are not.
  // This differs from the literal docstring claim ("a point on the polyline
  // is considered inside") - see the suspected-bug note in the final report.
  it('treats the bottom/right edges as inside, and the top/left edges/vertices as outside', () => {
    expect(containsPoint(square, [5, 0])).toBe(true); // bottom edge midpoint
    expect(containsPoint(square, [10, 5])).toBe(true); // right edge midpoint
    expect(containsPoint(square, [5, 10])).toBe(false); // top edge midpoint
    expect(containsPoint(square, [0, 5])).toBe(false); // left edge midpoint
    expect(containsPoint(square, [0, 0])).toBe(false); // vertex
    expect(containsPoint(square, [10, 10])).toBe(false); // vertex
  });

  it('handles a concave (L-shaped) polygon correctly', () => {
    // L-shape: a 10x10 square with the top-right 5x5 quadrant notched out.
    const lShape = [
      [0, 0],
      [10, 0],
      [10, 5],
      [5, 5],
      [5, 10],
      [0, 10],
    ];
    expect(containsPoint(lShape, [2, 2])).toBe(true); // in the main body
    expect(containsPoint(lShape, [7, 2])).toBe(true); // in the narrow bottom-right arm
    expect(containsPoint(lShape, [7, 7])).toBe(false); // inside the notch (removed area)
  });

  it('excludes points that fall inside a hole', () => {
    const hole = [
      [3, 3],
      [7, 3],
      [7, 7],
      [3, 7],
    ];
    expect(containsPoint(square, [5, 5], { holes: [hole] })).toBe(false);
    expect(containsPoint(square, [1, 1], { holes: [hole] })).toBe(true);
  });
});

describe('containsPoints', () => {
  it('returns true only when every point is inside', () => {
    expect(
      containsPoints(square, [
        [1, 1],
        [2, 2],
      ])
    ).toBe(true);
    expect(
      containsPoints(square, [
        [1, 1],
        [20, 20],
      ])
    ).toBe(false);
  });
});

describe('getArea', () => {
  it('computes the area of a 10x10 square (shoelace) as 100', () => {
    expect(getArea(square)).toBeCloseTo(100, 10);
  });

  it('is winding-independent (always positive)', () => {
    expect(getArea(square.slice().reverse())).toBeCloseTo(100, 10);
  });

  it('computes the area of a right triangle (legs 4 and 3) as 6', () => {
    const triangle = [
      [0, 0],
      [4, 0],
      [0, 3],
    ];
    // Area of a right triangle = 0.5 * base * height = 0.5 * 4 * 3 = 6
    expect(getArea(triangle)).toBeCloseTo(6, 10);
  });
});

describe('getSignedArea / getWindingDirection', () => {
  it('returns a positive signed area and winding of 1 for this CCW-ordered square', () => {
    // (0,0) -> (10,0) -> (10,10) -> (0,10) sweeps counter-clockwise in a
    // standard (+x right, +y up) plane, giving a positive signed area.
    expect(getSignedArea(square)).toBeCloseTo(100, 10);
    expect(getWindingDirection(square)).toBe(1);
  });

  it('flips sign/winding when the vertex order is reversed', () => {
    const reversed = square.slice().reverse();
    expect(getSignedArea(reversed)).toBeCloseTo(-100, 10);
    expect(getWindingDirection(reversed)).toBe(-1);
  });

  it('returns 0 for degenerate polylines with fewer than 3 points', () => {
    expect(
      getSignedArea([
        [0, 0],
        [1, 1],
      ])
    ).toBe(0);
  });
});

describe('isClosed', () => {
  it('returns false for an open polyline', () => {
    expect(isClosed(square)).toBe(false);
  });

  it('returns true when the last point repeats the first', () => {
    expect(isClosed([...square, square[0]])).toBe(true);
  });

  it('returns false for polylines with fewer than 3 points', () => {
    expect(
      isClosed([
        [0, 0],
        [0, 0],
      ])
    ).toBe(false);
  });
});

describe('getAABB', () => {
  it('computes the bounding box of a 2D polyline', () => {
    expect(getAABB(square)).toEqual({ minX: 0, maxX: 10, minY: 0, maxY: 10 });
  });

  it('computes the bounding box from a flat 2D number array', () => {
    expect(getAABB([0, 0, 10, 0, 10, 10, 0, 10])).toEqual({
      minX: 0,
      maxX: 10,
      minY: 0,
      maxY: 10,
    });
  });

  it('computes the bounding box of a 3D polyline', () => {
    const cube = [
      [0, 0, 0],
      [10, 0, 2],
      [10, 10, -3],
      [0, 10, 7],
    ];
    expect(getAABB(cube, { numDimensions: 3 })).toEqual({
      minX: 0,
      maxX: 10,
      minY: 0,
      maxY: 10,
      minZ: -3,
      maxZ: 7,
    });
  });
});

describe('getNormal2 / getNormal3', () => {
  it('returns +Z for a CCW 2D polygon and -Z for a CW one', () => {
    expect(getNormal2(square)).toEqual([0, 0, 1]);
    expect(getNormal2(square.slice().reverse())).toEqual([0, 0, -1]);
  });

  it('returns a unit +Z normal for a planar CCW 3D polygon lying on z=5', () => {
    const square3D = square.map((p) => [p[0], p[1], 5]);
    const normal = getNormal3(square3D);
    expect(normal[0]).toBeCloseTo(0, 5);
    expect(normal[1]).toBeCloseTo(0, 5);
    expect(normal[2]).toBeCloseTo(1, 5);
  });
});

describe('arePolylinesIdentical', () => {
  it('returns true for identical point order', () => {
    expect(arePolylinesIdentical(square, square.slice())).toBe(true);
  });

  it('returns true for reversed winding (same shape)', () => {
    expect(arePolylinesIdentical(square, square.slice().reverse())).toBe(true);
  });

  it('returns true for a cyclic shift of the starting vertex', () => {
    const shifted = [square[2], square[3], square[0], square[1]];
    expect(arePolylinesIdentical(square, shifted)).toBe(true);
  });

  it('returns false for a different shape', () => {
    const other = [
      [0, 0],
      [5, 0],
      [5, 5],
      [0, 5],
    ];
    expect(arePolylinesIdentical(square, other)).toBe(false);
  });

  it('returns false when lengths differ', () => {
    expect(
      arePolylinesIdentical(square, [
        [0, 0],
        [1, 1],
      ])
    ).toBe(false);
  });
});

describe('areLineSegmentsIntersecting', () => {
  it('detects a simple crossing (X shape)', () => {
    expect(
      areLineSegmentsIntersecting([0, 0], [10, 10], [0, 10], [10, 0])
    ).toBe(true);
  });

  it('detects touching at a shared endpoint', () => {
    expect(
      areLineSegmentsIntersecting([0, 0], [10, 10], [10, 10], [20, 0])
    ).toBe(true);
  });

  it('detects collinear overlapping segments', () => {
    expect(areLineSegmentsIntersecting([0, 0], [10, 0], [5, 0], [15, 0])).toBe(
      true
    );
  });

  it('returns false for parallel, non-overlapping (disjoint) segments', () => {
    expect(areLineSegmentsIntersecting([0, 0], [10, 0], [0, 1], [10, 1])).toBe(
      false
    );
  });
});

describe('getClosestLineSegmentIntersection', () => {
  it('returns the closest intersecting edge to the ray start point', () => {
    // Horizontal ray from x=-5 to x=15 at y=5 crosses the square's left
    // edge (x=0) and right edge (x=10). The left edge's segment endpoints
    // (0,10)/(0,0) have midpoint (0,5), which is 5 units from p1=(-5,5);
    // the right edge's endpoints (10,0)/(10,10) have midpoint (10,5), 15
    // units away. So the left edge (indexes [3, 0]) should win.
    const result = getClosestLineSegmentIntersection(square, [-5, 5], [15, 5]);
    expect(result.segment).toEqual([3, 0]);
    expect(result.distance).toBeCloseTo(5, 10);
  });

  it('returns undefined when there is no intersection', () => {
    expect(
      getClosestLineSegmentIntersection(square, [100, 100], [200, 200])
    ).toBeUndefined();
  });
});

describe('isPointInsidePolyline3D', () => {
  const poly3D = square.map((p) => [p[0], p[1], 5]);

  it('returns true for a point inside a planar 3D polygon', () => {
    expect(isPointInsidePolyline3D([5, 5, 5], poly3D)).toBe(true);
  });

  it('returns false for a point outside a planar 3D polygon', () => {
    expect(isPointInsidePolyline3D([15, 15, 5], poly3D)).toBe(false);
  });

  it('supports holes', () => {
    const holePoly3D = [
      [3, 3, 5],
      [7, 3, 5],
      [7, 7, 5],
      [3, 7, 5],
    ];
    expect(
      isPointInsidePolyline3D([5, 5, 5], poly3D, { holes: [holePoly3D] })
    ).toBe(false);
  });
});

describe('convexHull', () => {
  it('drops interior points, keeping only the hull vertices', () => {
    // A square plus a point right in the middle - the hull should be just
    // the square, in CCW order starting at the leftmost point.
    const pts = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [5, 5],
    ];
    expect(convexHull(pts)).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]);
  });

  it('reduces collinear points down to the two extremes', () => {
    const collinear = [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ];
    expect(convexHull(collinear)).toEqual([
      [0, 0],
      [3, 0],
    ]);
  });

  it('returns the input as-is for fewer than 3 points', () => {
    const pts = [
      [0, 0],
      [1, 1],
    ];
    expect(convexHull(pts)).toEqual(pts);
  });
});

describe('decimate', () => {
  it('preserves start/end points and drops points within epsilon of the simplified line', () => {
    // Points (1, 0.01) and (2, 0) are near-collinear with the (0,0)-(4,0)
    // baseline (distances 0.01 and 0 respectively, both << default epsilon
    // 0.1), while (3, 5) is far away (distance 5) and must be kept as the
    // corner of the "spike". After (3,5) becomes a partition pivot, (2,0)
    // is still >0.1 from the (0,0)-(3,5) line (~1.72 away) so it survives,
    // but (1, 0.01) collapses onto the (0,0)-(2,0) sub-baseline (distance
    // 0.01 < epsilon) and gets dropped.
    const poly = [
      [0, 0],
      [1, 0.01],
      [2, 0],
      [3, 5],
      [4, 0],
    ];
    expect(decimate(poly)).toEqual([
      [0, 0],
      [2, 0],
      [3, 5],
      [4, 0],
    ]);
  });

  it('collapses everything between the endpoints when epsilon is large', () => {
    const poly = [
      [0, 0],
      [1, 0.01],
      [2, 0],
      [3, 5],
      [4, 0],
    ];
    // With epsilon=10 even the (3,5) spike (distance 5 from the baseline)
    // is within tolerance, so only the two endpoints remain.
    expect(decimate(poly, 10)).toEqual([
      [0, 0],
      [4, 0],
    ]);
  });

  it('returns the input unchanged when it has fewer than 3 points', () => {
    const poly = [
      [0, 0],
      [1, 1],
    ];
    expect(decimate(poly)).toBe(poly);
  });
});

describe('getFirstLineSegmentIntersectionIndexes / getLineSegmentIntersectionsIndexes / getLineSegmentIntersectionsCoordinates', () => {
  // Horizontal ray from (-5,5) to (15,5) crosses both the left edge
  // (index 3->0, x=0) and the right edge (index 1->2, x=10) of the square.
  const p1 = [-5, 5];
  const q1 = [15, 5];

  it('getFirstLineSegmentIntersectionIndexes returns the first crossing found (closed segment [3,0] checked first)', () => {
    expect(getFirstLineSegmentIntersectionIndexes(square, p1, q1)).toEqual([
      3, 0,
    ]);
  });

  it('getFirstLineSegmentIntersectionIndexes returns undefined when there is no crossing', () => {
    expect(
      getFirstLineSegmentIntersectionIndexes(square, [100, 100], [200, 200])
    ).toBeUndefined();
  });

  it('getLineSegmentIntersectionsIndexes returns every crossing edge, in edge-order', () => {
    expect(getLineSegmentIntersectionsIndexes(square, p1, q1)).toEqual([
      [1, 2],
      [3, 0],
    ]);
  });

  it('getLineSegmentIntersectionsCoordinates returns the actual intersection coordinates', () => {
    expect(getLineSegmentIntersectionsCoordinates(square, p1, q1)).toEqual([
      [10, 5],
      [0, 5],
    ]);
  });

  it('respects closed=false by skipping the closing (last-to-first) segment', () => {
    // With closed=false, the polyline is treated as open, so segment
    // [3 -> 0] (the closing edge) is never tested; only the left edge
    // itself is missing here because index 3 has no "next" segment when
    // open, so only the right-edge crossing remains.
    expect(getLineSegmentIntersectionsIndexes(square, p1, q1, false)).toEqual([
      [1, 2],
    ]);
  });
});

describe('intersectPolyline (existence check between two polylines)', () => {
  it('returns true when two polylines cross', () => {
    const crossingSquare = [
      [5, 5],
      [15, 5],
      [15, 15],
      [5, 15],
    ];
    expect(intersectPolyline(square, crossingSquare)).toBe(true);
  });

  it('returns false for disjoint polylines', () => {
    const farSquare = [
      [100, 100],
      [110, 100],
      [110, 110],
      [100, 110],
    ];
    expect(intersectPolyline(square, farSquare)).toBe(false);
  });
});

describe('pointCanProjectOnLine', () => {
  const p1 = [0, 0];
  const p2 = [10, 0];

  it('returns true when the projection falls on the segment within proximity', () => {
    expect(pointCanProjectOnLine([5, 1], p1, p2, 2)).toBe(true);
  });

  it('returns false when the projection is on the segment but too far away', () => {
    expect(pointCanProjectOnLine([5, 5], p1, p2, 2)).toBe(false);
  });

  it('returns false when the projection falls beyond the segment end', () => {
    expect(pointCanProjectOnLine([15, 0], p1, p2, 2)).toBe(false);
  });

  it('returns false when the point is behind the segment start (negative dot product)', () => {
    expect(pointCanProjectOnLine([-5, 0], p1, p2, 2)).toBe(false);
  });
});

describe('pointsAreWithinCloseContourProximity', () => {
  it('returns true when points are closer than the given proximity', () => {
    expect(pointsAreWithinCloseContourProximity([0, 0], [1, 0], 2)).toBe(true);
  });

  it('returns false when points are farther than the given proximity', () => {
    expect(pointsAreWithinCloseContourProximity([0, 0], [5, 0], 2)).toBe(false);
  });
});

describe('robustSegmentIntersection / pointsAreEqual', () => {
  it('finds a simple crossing intersection', () => {
    expect(
      robustSegmentIntersection([0, 0], [10, 10], [0, 10], [10, 0])
    ).toEqual([5, 5]);
  });

  it('returns null for parallel, disjoint segments', () => {
    expect(
      robustSegmentIntersection([0, 0], [10, 0], [0, 1], [10, 1])
    ).toBeNull();
  });

  it('returns a point for collinear overlapping segments', () => {
    expect(robustSegmentIntersection([0, 0], [10, 0], [5, 0], [15, 0])).toEqual(
      [5, 0]
    );
  });

  it('returns null for collinear, non-overlapping segments', () => {
    expect(
      robustSegmentIntersection([0, 0], [10, 0], [20, 0], [30, 0])
    ).toBeNull();
  });

  it('resolves a T-junction where an endpoint touches the interior of the other segment', () => {
    expect(robustSegmentIntersection([0, 0], [10, 0], [5, -5], [5, 0])).toEqual(
      [5, 0]
    );
  });

  it('does NOT resolve a fully-degenerate (zero-length) segment lying on the interior of another segment', () => {
    // This is a real edge case in the implementation: the degenerate branch
    // only special-cases a zero-length segment when it coincides exactly
    // with one of the OTHER segment's *endpoints* - not when it lies
    // somewhere along the other segment's interior. Documented here rather
    // than treated as a hard bug, since zero-length input segments are an
    // unusual/degenerate case in practice.
    expect(
      robustSegmentIntersection([5, 5], [5, 5], [0, 0], [10, 10])
    ).toBeNull();
  });

  it('pointsAreEqual uses an epsilon tolerance', () => {
    expect(pointsAreEqual([1, 1], [1, 1])).toBe(true);
    expect(pointsAreEqual([1, 1], [1.01, 1])).toBe(false);
  });
});

describe('projectTo2D', () => {
  it('projects a polygon planar on z, dropping the z dimension', () => {
    const polyZ = [
      [0, 0, 5],
      [10, 0, 5],
      [10, 10, 5],
      [0, 10, 5],
    ];
    const { sharedDimensionIndex, projectedPolyline } = projectTo2D(polyZ);
    expect(sharedDimensionIndex).toBe(2);
    expect(projectedPolyline).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]);
  });

  it('projects a polygon planar on x, keeping (y, z)', () => {
    const polyX = [
      [3, 0, 0],
      [3, 10, 0],
      [3, 10, 10],
      [3, 0, 10],
    ];
    const { sharedDimensionIndex, projectedPolyline } = projectTo2D(polyX);
    expect(sharedDimensionIndex).toBe(0);
    expect(projectedPolyline).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]);
  });

  it('throws when no shared dimension can be found (oblique plane)', () => {
    const oblique = [
      [0, 0, 0],
      [1, 1, 1],
      [2, 0, 3],
    ];
    expect(() => projectTo2D(oblique)).toThrow();
  });
});

describe('getSubPixelSpacingAndXYDirections', () => {
  // `isGenericViewport`/`getViewportContentMode` are duck-typed (they only
  // check for method presence), and `StackViewport` is only used for an
  // `instanceof` check - so plain stub objects work without needing to
  // mock `@cornerstonejs/core` for this function specifically.

  it('reads spacing/direction straight off the image data for a stack (image-slice) viewport', () => {
    const viewport = Object.create(StackViewport.prototype);
    viewport.getImageData = () => ({
      // direction is a 9-element row-major 3x3 matrix: rows are iVector,
      // jVector, kVector.
      direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      spacing: [0.5, 0.25],
    });

    const result = getSubPixelSpacingAndXYDirections(viewport, 10);

    expect(viewport instanceof StackViewport).toBe(true);
    expect(result.xDir).toEqual([1, 0, 0]);
    expect(result.yDir).toEqual([0, 1, 0]);
    // subPixelResolution divides the native spacing: 0.5/10 and 0.25/10.
    expect(result.spacing[0]).toBeCloseTo(0.05, 10);
    expect(result.spacing[1]).toBeCloseTo(0.025, 10);
  });

  it('derives spacing/direction from the camera for a volume viewport (axial view)', () => {
    // Identity direction matrix (i=x, j=y, k=z), spacing [1,1,2] (mm per
    // voxel along i,j,k). Axial view: normal along +k, up along -y.
    const viewport = {
      getImageData: () => ({
        direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        spacing: [1, 1, 2],
      }),
      getCamera: () => ({
        viewPlaneNormal: [0, 0, 1],
        viewUp: [0, -1, 0],
      }),
    };

    const result = getSubPixelSpacingAndXYDirections(viewport, 10);

    // viewRight = cross(viewUp, viewPlaneNormal) = cross([0,-1,0],[0,0,1])
    // = [-1, 0, 0], which is parallel to the i (x) direction -> xSpacing
    // comes from volumeSpacing[0] = 1; viewUp=[0,-1,0] is parallel to the
    // j (y) direction -> ySpacing comes from volumeSpacing[1] = 1.
    expect(result.xDir).toEqual([1, 0, 0]);
    expect(result.yDir).toEqual([0, 1, 0]);
    expect(result.spacing[0]).toBeCloseTo(0.1, 10);
    expect(result.spacing[1]).toBeCloseTo(0.1, 10);
  });
});

describe('addCanvasPointsToArray (light coverage - heavy viewport dependency mocked)', () => {
  const identityCanvasToWorld = (p) => [p[0], p[1], 0];

  beforeEach(() => {
    getEnabledElement.mockReset();
  });

  it('pushes the point directly when the array is empty', () => {
    getEnabledElement.mockReturnValue({
      viewport: { canvasToWorld: identityCanvasToWorld },
    });
    const canvasPoints = [];
    const numAdded = addCanvasPointsToArray(
      document.createElement('div'),
      canvasPoints,
      [5, 5],
      { xDir: [1, 0, 0], yDir: [0, 1, 0], spacing: [1, 1] }
    );
    expect(numAdded).toBe(1);
    expect(canvasPoints).toEqual([[5, 5]]);
  });

  it('does not interpolate when the new point is within one sub-pixel spacing unit', () => {
    getEnabledElement.mockReturnValue({
      viewport: { canvasToWorld: identityCanvasToWorld },
    });
    const canvasPoints = [[0, 0]];
    const numAdded = addCanvasPointsToArray(
      document.createElement('div'),
      canvasPoints,
      [0.5, 0],
      { xDir: [1, 0, 0], yDir: [0, 1, 0], spacing: [1, 1] }
    );
    expect(numAdded).toBe(0);
    expect(canvasPoints).toEqual([
      [0, 0],
      [0.5, 0],
    ]);
  });

  it('interpolates intermediate points when the gap exceeds the sub-pixel spacing', () => {
    getEnabledElement.mockReturnValue({
      viewport: { canvasToWorld: identityCanvasToWorld },
    });
    const canvasPoints = [[0, 0]];
    // World distance in x is 5, spacing[0] is 1 -> numPointsToAdd = floor(5/1) = 5.
    const numAdded = addCanvasPointsToArray(
      document.createElement('div'),
      canvasPoints,
      [5, 0],
      { xDir: [1, 0, 0], yDir: [0, 1, 0], spacing: [1, 1] }
    );
    expect(numAdded).toBe(5);
    // Original point + 5 evenly-spaced interpolated points ending exactly
    // at the requested new canvas point.
    expect(canvasPoints).toHaveLength(6);
    expect(canvasPoints[0]).toEqual([0, 0]);
    expect(canvasPoints[canvasPoints.length - 1]).toEqual([5, 0]);
    for (let i = 1; i < canvasPoints.length; i++) {
      expect(canvasPoints[i][0] - canvasPoints[i - 1][0]).toBeCloseTo(1, 10);
    }
  });
});
