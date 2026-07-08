/**
 * Unit tests for the pure-geometry boolean-op layer (`applyBoolean`).
 * Cases mirror SEMANTICS.md §6 and the hole-effect notes in §3.1 / §3.2 / §5.
 *
 * Tests are winding-agnostic (compare via absolute signed area), so they
 * don't depend on clipper's internal orientation convention — only on the
 * topology and solid-area sums that the spec promises.
 */

import {
  applyBoolean,
  BooleanOp,
  type PolygonWithHoles,
} from './clipperBooleanOps';
import type { Types } from '@cornerstonejs/core';

type P = Types.Point2;

// --- helpers ---------------------------------------------------------------

const square = (x: number, y: number, size: number): P[] => [
  [x, y],
  [x + size, y],
  [x + size, y + size],
  [x, y + size],
];

const poly = (outer: P[], ...holes: P[][]): PolygonWithHoles =>
  holes.length ? { outer, holes } : { outer };

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

function totalSolidArea(polygons: PolygonWithHoles[]): number {
  return polygons.reduce((sum, p) => sum + solidArea(p), 0);
}

/** Centroid of a polygon's outer ring (good enough to identify which input it came from). */
function centroid(ring: P[]): P {
  let cx = 0;
  let cy = 0;
  for (const [x, y] of ring) {
    cx += x;
    cy += y;
  }
  return [cx / ring.length, cy / ring.length];
}

/** True iff some polygon in `polygons` has an outer ring whose centroid is within `tol` of `pt`. */
function hasPolygonAt(polygons: PolygonWithHoles[], pt: P, tol = 1): boolean {
  return polygons.some((p) => {
    const c = centroid(p.outer);
    return Math.hypot(c[0] - pt[0], c[1] - pt[1]) <= tol;
  });
}

/** Approximate area equality (within `tol` square pixels). */
const expectArea = (polygons: PolygonWithHoles[], expected: number, tol = 1) =>
  expect(totalSolidArea(polygons)).toBeGreaterThanOrEqual(expected - tol) &&
  expect(totalSolidArea(polygons)).toBeLessThanOrEqual(expected + tol);

// --- tests -----------------------------------------------------------------

describe('applyBoolean', () => {
  // ----- Union (§6 + §5.1 hole effects) -----
  describe('Union', () => {
    it('disjoint inputs → both polygons in result (Case A)', () => {
      const r = applyBoolean(
        [poly(square(0, 0, 10))],
        [poly(square(20, 0, 10))],
        BooleanOp.Union
      );
      expect(r).toHaveLength(2);
      expectArea(r, 200);
    });

    it('edge-crossing → single merged polygon (Case B)', () => {
      // Two 10x10 squares, overlapping by 5 wide x 10 tall = 50 area
      const r = applyBoolean(
        [poly(square(0, 0, 10))],
        [poly(square(5, 0, 10))],
        BooleanOp.Union
      );
      expect(r).toHaveLength(1);
      expectArea(r, 100 + 100 - 50);
    });

    it('A contains B → A unchanged, no extra hole (Case C)', () => {
      const r = applyBoolean(
        [poly(square(0, 0, 100))],
        [poly(square(40, 40, 20))],
        BooleanOp.Union
      );
      expect(r).toHaveLength(1);
      expect(r[0].holes ?? []).toHaveLength(0);
      expectArea(r, 100 * 100);
    });

    it('A === B → A (Case G)', () => {
      const r = applyBoolean(
        [poly(square(0, 0, 50))],
        [poly(square(0, 0, 50))],
        BooleanOp.Union
      );
      expect(r).toHaveLength(1);
      expectArea(r, 2500);
    });

    it('B inside hole of A → two top-level polygons (Case E / §1.2)', () => {
      // A: 100x100 donut with a 60x60 hole centered. B: 20x20 inside the hole.
      const A = poly(square(0, 0, 100), square(20, 20, 60));
      const B = poly(square(40, 40, 20));
      const r = applyBoolean([A], [B], BooleanOp.Union);
      expect(r).toHaveLength(2);
      // donut + island
      expectArea(r, 100 * 100 - 60 * 60 + 20 * 20);
      // identify both pieces by centroid
      expect(hasPolygonAt(r, [50, 50], 2)).toBe(true); // both A donut and B share centroid 50,50
    });

    it('same outer, non-overlapping holes → outer preserved, no holes (§6 Case H)', () => {
      const A = poly(square(0, 0, 100), square(10, 10, 30));
      const B = poly(square(0, 0, 100), square(60, 60, 30));
      const r = applyBoolean([A], [B], BooleanOp.Union);
      expect(r).toHaveLength(1);
      expect(r[0].holes ?? []).toHaveLength(0);
      expectArea(r, 100 * 100);
    });

    it('B fills part of A hole → A hole shrinks (§5.1 hole effect)', () => {
      // A: 100x100 with 60x60 hole at (20,20). B: 30x30 at (20,20).
      const A = poly(square(0, 0, 100), square(20, 20, 60));
      const B = poly(square(20, 20, 30));
      const r = applyBoolean([A], [B], BooleanOp.Union);
      expect(r).toHaveLength(1);
      expect(r[0].holes ?? []).toHaveLength(1);
      // solid area: 100*100 - hole_area; hole shrinks from 3600 to 3600-900 = 2700
      expectArea(r, 100 * 100 - 2700);
    });

    it('B fully covers an A hole + extends into solid → A hole disappears', () => {
      const A = poly(square(0, 0, 100), square(40, 40, 20));
      // B encloses the entire hole and a bit more
      const B = poly(square(30, 30, 40));
      const r = applyBoolean([A], [B], BooleanOp.Union);
      expect(r).toHaveLength(1);
      expect(r[0].holes ?? []).toHaveLength(0);
      expectArea(r, 100 * 100);
    });

    it('B bridges two A polygons → polygons merge', () => {
      const A1 = poly(square(0, 0, 10));
      const A2 = poly(square(20, 0, 10));
      const B = poly(square(5, 2, 20)); // spans the gap
      const r = applyBoolean([A1, A2], [B], BooleanOp.Union);
      expect(r).toHaveLength(1);
    });

    it('two non-overlapping holes do NOT merge under Union (negative)', () => {
      // Same outer, holes don't intersect. Result: outer preserved, no holes
      // (holes survive only where both inputs are non-solid).
      const A = poly(square(0, 0, 100), square(10, 10, 20));
      const B = poly(square(0, 0, 100), square(70, 70, 20));
      const r = applyBoolean([A], [B], BooleanOp.Union);
      expect(r).toHaveLength(1);
      expect(r[0].holes ?? []).toHaveLength(0);
    });
  });

  // ----- Difference (§6 + §5.2 hole effects) -----
  describe('Difference', () => {
    it('disjoint → A unchanged (Case A)', () => {
      const r = applyBoolean(
        [poly(square(0, 0, 10))],
        [poly(square(20, 0, 10))],
        BooleanOp.Difference
      );
      expect(r).toHaveLength(1);
      expectArea(r, 100);
    });

    it('edge-crossing → A clipped (Case B)', () => {
      const r = applyBoolean(
        [poly(square(0, 0, 10))],
        [poly(square(5, 0, 10))],
        BooleanOp.Difference
      );
      expect(r).toHaveLength(1);
      expectArea(r, 50);
    });

    it('A contains B → A with new hole (Case C / §5.2 create hole)', () => {
      const r = applyBoolean(
        [poly(square(0, 0, 100))],
        [poly(square(40, 40, 20))],
        BooleanOp.Difference
      );
      expect(r).toHaveLength(1);
      expect(r[0].holes).toHaveLength(1);
      expectArea(r, 10000 - 400);
    });

    it('B contains A → empty (Case D)', () => {
      const r = applyBoolean(
        [poly(square(40, 40, 20))],
        [poly(square(0, 0, 100))],
        BooleanOp.Difference
      );
      expect(r).toHaveLength(0);
    });

    it('A === B → empty (Case G)', () => {
      const r = applyBoolean(
        [poly(square(0, 0, 50))],
        [poly(square(0, 0, 50))],
        BooleanOp.Difference
      );
      expect(r).toHaveLength(0);
    });

    it('B inside hole of A → A unchanged (Case E / no-op on empty space)', () => {
      const A = poly(square(0, 0, 100), square(20, 20, 60));
      const B = poly(square(40, 40, 20));
      const r = applyBoolean([A], [B], BooleanOp.Difference);
      expect(r).toHaveLength(1);
      expect(r[0].holes).toHaveLength(1);
      expectArea(r, 10000 - 3600);
    });

    it('B straddles A hole boundary → hole grows', () => {
      // A: 100x100 with 20x20 hole at (40,40). B: 30x30 at (35,35) — straddles hole's NW corner.
      const A = poly(square(0, 0, 100), square(40, 40, 20));
      const B = poly(square(35, 35, 30));
      const r = applyBoolean([A], [B], BooleanOp.Difference);
      expect(r).toHaveLength(1);
      expect(r[0].holes).toHaveLength(1);
      // The hole grows: original hole + part of B that fell in A's solid
      // Solid area = 10000 - new_hole_area; new_hole > 400
      expect(solidArea(r[0])).toBeLessThan(10000 - 400);
    });

    it('B bridges two A holes → A ends with one merged hole (§5.2 merge)', () => {
      // A: 100x100 with H1 at (10-30, 40-60) and H2 at (70-90, 40-60).
      // B: a thin horizontal strip (20-80, 48-55) that overlaps both holes
      //    AND removes the solid bridge between them — so the three empty
      //    regions (H1, the strip, H2) merge into a single hole.
      const A = poly(square(0, 0, 100), square(10, 40, 20), square(70, 40, 20));
      const B = poly([
        [20, 48],
        [80, 48],
        [80, 55],
        [20, 55],
      ]);
      const r = applyBoolean([A], [B], BooleanOp.Difference);
      expect(r).toHaveLength(1);
      expect(r[0].holes).toHaveLength(1);
    });

    it('B carves channel from A hole to A outer → hole merges with exterior, no hole', () => {
      // A: 100x100 with a 20x20 hole at (40,40). B: vertical strip from hole's top edge to A's top.
      // After subtract, the hole is "open" — result is one polygon, concave outer, no hole.
      const A = poly(square(0, 0, 100), square(40, 40, 20));
      const B = poly(square(45, 0, 10)); // strip from y=0 to y=10 in solid, connecting hole's top
      // Actually B needs to reach into the hole. Hole is at (40,40)-(60,60).
      // Make B span (45,0) to (55,50) — crosses solid AND extends into hole.
      const B2 = poly(square(45, 0, 10));
      // B2 is (45,0)-(55,10) which is in solid (above hole). Need to extend into hole.
      const Bchannel = poly([
        [45, 0],
        [55, 0],
        [55, 50],
        [45, 50],
      ]);
      const r = applyBoolean([A], [Bchannel], BooleanOp.Difference);
      expect(r).toHaveLength(1);
      expect(r[0].holes ?? []).toHaveLength(0);
    });
  });

  // ----- Intersection (§6) -----
  describe('Intersection', () => {
    it('disjoint → empty (Case A)', () => {
      const r = applyBoolean(
        [poly(square(0, 0, 10))],
        [poly(square(20, 0, 10))],
        BooleanOp.Intersection
      );
      expect(r).toHaveLength(0);
    });

    it('edge-crossing → overlap region (Case B)', () => {
      const r = applyBoolean(
        [poly(square(0, 0, 10))],
        [poly(square(5, 0, 10))],
        BooleanOp.Intersection
      );
      expect(r).toHaveLength(1);
      expectArea(r, 50);
    });

    it('A contains B → B (Case C)', () => {
      const r = applyBoolean(
        [poly(square(0, 0, 100))],
        [poly(square(40, 40, 20))],
        BooleanOp.Intersection
      );
      expect(r).toHaveLength(1);
      expectArea(r, 400);
    });

    it('B contains A → A (Case D)', () => {
      const r = applyBoolean(
        [poly(square(40, 40, 20))],
        [poly(square(0, 0, 100))],
        BooleanOp.Intersection
      );
      expect(r).toHaveLength(1);
      expectArea(r, 400);
    });

    it('B inside hole of A → empty (Case E)', () => {
      const A = poly(square(0, 0, 100), square(20, 20, 60));
      const B = poly(square(40, 40, 20));
      const r = applyBoolean([A], [B], BooleanOp.Intersection);
      expect(r).toHaveLength(0);
    });

    it('A === B → A (Case G)', () => {
      const r = applyBoolean(
        [poly(square(0, 0, 50))],
        [poly(square(0, 0, 50))],
        BooleanOp.Intersection
      );
      expect(r).toHaveLength(1);
      expectArea(r, 2500);
    });
  });

  // ----- XOR (§6) -----
  describe('XOR', () => {
    it('disjoint → both polygons (Case A)', () => {
      const r = applyBoolean(
        [poly(square(0, 0, 10))],
        [poly(square(20, 0, 10))],
        BooleanOp.Xor
      );
      expect(r).toHaveLength(2);
      expectArea(r, 200);
    });

    it('A === B → empty (Case G)', () => {
      const r = applyBoolean(
        [poly(square(0, 0, 50))],
        [poly(square(0, 0, 50))],
        BooleanOp.Xor
      );
      expect(r).toHaveLength(0);
    });

    it('A contains B → A with B as hole (Case C)', () => {
      const r = applyBoolean(
        [poly(square(0, 0, 100))],
        [poly(square(40, 40, 20))],
        BooleanOp.Xor
      );
      expect(r).toHaveLength(1);
      expect(r[0].holes).toHaveLength(1);
      expectArea(r, 10000 - 400);
    });

    it('edge-crossing → symmetric difference (Case B)', () => {
      // 100*100 + 100*100 - 2 * (5x10 overlap of two 10x10 = 50) = 200 - 100 = 100
      const r = applyBoolean(
        [poly(square(0, 0, 10))],
        [poly(square(5, 0, 10))],
        BooleanOp.Xor
      );
      expectArea(r, 100);
    });
  });

  // ----- Edge / invariant guarantees -----
  describe('Edge guarantees', () => {
    it('empty subjects + Union → returns clip polygons', () => {
      const r = applyBoolean([], [poly(square(0, 0, 10))], BooleanOp.Union);
      expect(r).toHaveLength(1);
      expectArea(r, 100);
    });

    it('empty subjects + Difference → empty', () => {
      const r = applyBoolean(
        [],
        [poly(square(0, 0, 10))],
        BooleanOp.Difference
      );
      expect(r).toHaveLength(0);
    });

    it('empty clips + Difference → subjects unchanged', () => {
      const r = applyBoolean(
        [poly(square(0, 0, 10))],
        [],
        BooleanOp.Difference
      );
      expect(r).toHaveLength(1);
      expectArea(r, 100);
    });

    it('empty clips + Intersection → empty', () => {
      const r = applyBoolean(
        [poly(square(0, 0, 10))],
        [],
        BooleanOp.Intersection
      );
      expect(r).toHaveLength(0);
    });

    it('subjects with <3-vertex outer are skipped', () => {
      const r = applyBoolean(
        [
          poly([
            [0, 0],
            [1, 1],
          ] as P[]),
        ],
        [poly(square(0, 0, 10))],
        BooleanOp.Union
      );
      // Only the clip square survives.
      expect(r).toHaveLength(1);
      expectArea(r, 100);
    });

    it('three-deep nesting flattens to 3 top-level polygons (Case J)', () => {
      // A donut around B donut around C
      const A = poly(square(0, 0, 100), square(10, 10, 80));
      const B = poly(square(20, 20, 60), square(30, 30, 40));
      const C = poly(square(40, 40, 20));
      const r = applyBoolean([A], [B, C], BooleanOp.Union);
      expect(r).toHaveLength(3);
    });
  });
});
