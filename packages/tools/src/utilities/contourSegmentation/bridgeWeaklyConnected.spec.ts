/**
 * Unit tests for keyhole/bridge stitching of weakly-connected polygons and the
 * self-intersection splitter that feeds it. Together these keep a hand-drawn
 * figure-eight a SINGLE contour whose path traverses both lobes (SEMANTICS §3.4
 * ADD), instead of two separate annotations.
 *
 * Tests compare absolute areas so they don't depend on winding convention.
 */

import type { Types } from '@cornerstonejs/core';
import {
  applyBoolean,
  BooleanOp,
  splitSelfIntersections,
  type PolygonWithHoles,
} from './clipperBooleanOps';
import {
  bridgeSelfIntersectingPolyline,
  unifyWeaklyConnectedPolygons,
} from './bridgeWeaklyConnected';

type P = Types.Point2;

function ringAbsArea(ring: P[]): number {
  let area = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % n];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area / 2);
}

function solidArea(p: PolygonWithHoles): number {
  let a = ringAbsArea(p.outer);
  p.holes?.forEach((h) => {
    a -= ringAbsArea(h);
  });
  return a;
}

const totalArea = (polys: PolygonWithHoles[]): number =>
  polys.reduce((sum, p) => sum + solidArea(p), 0);

const centroidX = (ring: P[]): number =>
  ring.reduce((sum, [x]) => sum + x, 0) / ring.length;

const square = (x: number, y: number, size: number): P[] => [
  [x, y],
  [x + size, y],
  [x + size, y + size],
  [x, y + size],
];

// Self-intersecting "bowtie": edges (A->B) and (C->D) cross at (0,0), giving a
// left triangle and a right triangle of area 100 each (total 200).
const bowtie = (): P[] => [
  [-10, -10],
  [10, 10],
  [10, -10],
  [-10, 10],
];

describe('splitSelfIntersections', () => {
  it('leaves a simple polygon as a single ring', () => {
    const rings = splitSelfIntersections(square(0, 0, 10));
    expect(rings.length).toBe(1);
    expect(ringAbsArea(rings[0].outer)).toBeCloseTo(100, 4);
  });

  it('splits a self-intersecting bowtie into two touching rings', () => {
    const rings = splitSelfIntersections(bowtie());
    expect(rings.length).toBe(2);
    expect(totalArea(rings)).toBeCloseTo(200, 2);
  });

  it('returns nothing for a degenerate (< 3 point) polyline', () => {
    expect(splitSelfIntersections([[0, 0]] as P[])).toEqual([]);
  });
});

describe('unifyWeaklyConnectedPolygons', () => {
  it('stitches two rings touching at a point into one contour', () => {
    const lobes = splitSelfIntersections(bowtie());
    expect(lobes.length).toBe(2);

    const unified = unifyWeaklyConnectedPolygons(lobes);

    // One contour, covering both lobes, area preserved.
    expect(unified.length).toBe(1);
    expect(totalArea(unified)).toBeCloseTo(200, 2);
  });

  it('leaves genuinely disjoint polygons separate', () => {
    const disjoint: PolygonWithHoles[] = [
      { outer: square(0, 0, 10) },
      { outer: square(100, 100, 10) },
    ];

    const unified = unifyWeaklyConnectedPolygons(disjoint);

    expect(unified.length).toBe(2);
    expect(totalArea(unified)).toBeCloseTo(200, 4);
  });

  it('is a no-op for a single polygon', () => {
    const single: PolygonWithHoles[] = [{ outer: square(0, 0, 10) }];
    expect(unifyWeaklyConnectedPolygons(single)).toBe(single);
  });

  it('preserves holes of every merged ring', () => {
    // Two outers touching at (10,0), each carrying its own hole.
    const left: PolygonWithHoles = {
      outer: [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
      holes: [square(2, 2, 2)],
    };
    const right: PolygonWithHoles = {
      outer: [
        [10, 0],
        [20, 0],
        [20, 10],
        [10, 10],
      ],
      holes: [square(15, 5, 2)],
    };

    const unified = unifyWeaklyConnectedPolygons([left, right]);

    expect(unified.length).toBe(1);
    expect(unified[0].holes?.length).toBe(2);
    // 2 unit-10 squares (200) minus two 2x2 holes (8) = 192.
    expect(totalArea(unified)).toBeCloseTo(192, 2);
  });
});

describe('bridgeSelfIntersectingPolyline', () => {
  it('returns a simple polyline unchanged (identity)', () => {
    const line = square(0, 0, 10);
    expect(bridgeSelfIntersectingPolyline(line)).toBe(line);
  });

  it('returns a degenerate polyline unchanged', () => {
    const line = [[0, 0]] as P[];
    expect(bridgeSelfIntersectingPolyline(line)).toBe(line);
  });

  it('stitches a figure-eight into one ring covering both lobes', () => {
    const result = bridgeSelfIntersectingPolyline(bowtie());

    // One ring, both lobes' area preserved (~200), traverses every vertex.
    expect(ringAbsArea(result)).toBeCloseTo(200, 1);
    expect(result.length).toBeGreaterThanOrEqual(bowtie().length);
  });
});

/**
 * Mirrors what `applyStroke` does at the geometry layer for a drawn figure-eight
 * that is then erased at the neck and later re-connected:
 *   - SUBTRACT (shift+drag) does NOT unify  → erasing the neck splits it in two.
 *   - ADD (normal drag) DOES unify          → reconnecting merges back to one.
 * This guards the Union-only scoping of `unifyWeaklyConnectedPolygons`.
 */
describe('figure-eight neck round-trip (Union-only scoping)', () => {
  // 8x8 eraser centred on the crossing point, severing the two lobes.
  const neckEraser = (): P[] => square(-4, -4, 8);

  // Subtract the neck from the single bridged figure-eight contour.
  const splitAtNeck = (): PolygonWithHoles[] => {
    const fig8 = bridgeSelfIntersectingPolyline(bowtie());
    return applyBoolean(
      [{ outer: fig8 }],
      [{ outer: neckEraser() }],
      BooleanOp.Difference
    );
  };

  it('SUBTRACT at the neck splits the figure-eight into two contours', () => {
    // SUBTRACT path in applyStroke leaves the boolean result un-unified.
    const pieces = splitAtNeck();

    expect(pieces.length).toBe(2);

    // One piece on each side of the severed neck.
    const xs = pieces.map((p) => centroidX(p.outer)).sort((a, b) => a - b);
    expect(xs[0]).toBeLessThan(0);
    expect(xs[1]).toBeGreaterThan(0);
  });

  it('ADD reconnecting the pieces merges them back into one contour', () => {
    const pieces = splitAtNeck();
    expect(pieces.length).toBe(2);

    // A bar across the gap, overlapping both pieces (normal drag = Union).
    const connector: P[] = [
      [-6, -1],
      [6, -1],
      [6, 1],
      [-6, 1],
    ];

    const merged = unifyWeaklyConnectedPolygons(
      applyBoolean(
        pieces.map((p) => ({ outer: p.outer })),
        [{ outer: connector }],
        BooleanOp.Union
      )
    );

    expect(merged.length).toBe(1);
  });
});

/**
 * Two freeforms in the same segment that intersect over a run of points (a
 * shared area or a shared boundary, not just a single point) must combine into
 * one freeform on ADD. Mirrors the `applyStroke` Union path: union the existing
 * target with the new stroke, then run the unify step.
 */
describe('two intersecting freeforms merge into one (Union)', () => {
  const addStroke = (target: P[], stroke: P[]): PolygonWithHoles[] =>
    unifyWeaklyConnectedPolygons(
      applyBoolean(
        [{ outer: target }],
        splitSelfIntersections(stroke),
        BooleanOp.Union
      )
    );

  it('overlapping areas merge into a single contour', () => {
    // Two 10x10 squares overlapping in a 5x10 strip → union area 150.
    const merged = addStroke(square(0, 0, 10), square(5, 0, 10));

    expect(merged.length).toBe(1);
    expect(merged[0].holes ?? []).toHaveLength(0);
    expect(totalArea(merged)).toBeCloseTo(150, 1);
  });

  it('boundaries overlapping along a consecutive run (shared edge) merge', () => {
    // Two 10x10 squares abutting along the x=10 edge → single 20x10 rectangle.
    const merged = addStroke(square(0, 0, 10), square(10, 0, 10));

    expect(merged.length).toBe(1);
    expect(totalArea(merged)).toBeCloseTo(200, 1);
  });

  it('a partial cross-over still yields one combined contour', () => {
    // Offset in both axes so the outlines cross at two points.
    const merged = addStroke(square(0, 0, 10), square(6, 6, 10));

    expect(merged.length).toBe(1);
    // 100 + 100 - (4x4 overlap = 16) = 184.
    expect(totalArea(merged)).toBeCloseTo(184, 1);
  });
});
