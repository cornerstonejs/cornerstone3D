/**
 * Keyhole/bridge stitching for weakly-connected polygons (SEMANTICS.md §3.4).
 *
 * Clipper only ever emits *simple* (non-self-intersecting) rings. A polygon
 * that is topologically connected only at a point — the two lobes of a
 * hand-drawn figure-eight, for example — therefore comes back as two separate
 * rings that touch at the crossing. Stored as two annotations this both
 * mis-represents the user's single drawn shape and fails to round-trip
 * cleanly.
 *
 * This module rejoins such touching rings into a single, weakly-simple ring by
 * splicing one ring into the other at their point of contact (a zero-width
 * "bridge"). The result is one contour whose path traverses both lobes, with a
 * consistent winding direction. Rings that do not touch are left alone — a
 * segment legitimately holds multiple disjoint contours.
 */

import type { Types } from '@cornerstonejs/core';
import * as math from '../math';
import {
  splitSelfIntersections,
  type PolygonWithHoles,
} from './clipperBooleanOps';

/**
 * Maximum gap (in canvas pixels) between two rings for them to count as
 * touching. Clipper rounds coordinates to 4 decimal places, so rings split
 * from a single self-intersecting contour share their crossing vertex to
 * within rounding. This threshold is far below the spacing of genuinely
 * separate contours, so disjoint regions are never merged.
 */
const TOUCH_EPS = 1e-2;
const TOUCH_EPS_SQ = TOUCH_EPS * TOUCH_EPS;

function dist2(a: Types.Point2, b: Types.Point2): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

/** Do the two AABBs come within TOUCH_EPS of each other? Cheap pre-reject. */
function boxesWithinEps(a: Types.AABB2, b: Types.AABB2): boolean {
  return (
    a.minX <= b.maxX + TOUCH_EPS &&
    b.minX <= a.maxX + TOUCH_EPS &&
    a.minY <= b.maxY + TOUCH_EPS &&
    b.minY <= a.maxY + TOUCH_EPS
  );
}

/** True if any vertex of `a` lies within TOUCH_EPS of any vertex of `b`. */
function ringsTouch(a: Types.Point2[], b: Types.Point2[]): boolean {
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      if (dist2(a[i], b[j]) <= TOUCH_EPS_SQ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Splice ring `b` into ring `a` at their closest pair of vertices, producing a
 * single ring that traverses both. `b` is reversed first if needed so both
 * lobes wind the same way, keeping the merged ring's orientation consistent.
 */
function spliceTwoRings(a: Types.Point2[], b: Types.Point2[]): Types.Point2[] {
  const bb =
    math.polyline.getWindingDirection(b) !==
    math.polyline.getWindingDirection(a)
      ? [...b].reverse()
      : b;

  // Closest pair of vertices = where the bridge is attached.
  let best = Infinity;
  let ai = 0;
  let bj = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < bb.length; j++) {
      const d = dist2(a[i], bb[j]);
      if (d < best) {
        best = d;
        ai = i;
        bj = j;
      }
    }
  }

  // Walk `bb` as a closed loop starting and ending at its bridge vertex.
  const loop = [...bb.slice(bj), ...bb.slice(0, bj)];

  // a[0..ai] -> (bridge) -> full b loop -> (bridge back) -> a[ai+1..end].
  // The two bridge hops are zero-length when the rings share the vertex.
  return [...a.slice(0, ai + 1), ...loop, loop[0], ...a.slice(ai + 1)];
}

/**
 * Partition outer-ring indices into connected components, where two rings are
 * connected when they touch (within TOUCH_EPS). Simple union-find.
 */
function groupTouchingOuters(outers: Types.Point2[][]): number[][] {
  const n = outers.length;
  const parent = Array.from({ length: n }, (_, i) => i);

  const find = (x: number): number => {
    let root = x;
    while (parent[root] !== root) {
      root = parent[root];
    }
    while (parent[x] !== root) {
      const next = parent[x];
      parent[x] = root;
      x = next;
    }
    return root;
  };
  const union = (x: number, y: number): void => {
    parent[find(x)] = find(y);
  };

  const boxes = outers.map((o) => math.polyline.getAABB(o) as Types.AABB2);

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (
        boxesWithinEps(boxes[i], boxes[j]) &&
        ringsTouch(outers[i], outers[j])
      ) {
        union(i, j);
      }
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const group = groups.get(root);
    if (group) {
      group.push(i);
    } else {
      groups.set(root, [i]);
    }
  }
  return [...groups.values()];
}

/**
 * Merge polygons whose outer rings only touch at a point into a single
 * weakly-simple polygon, leaving genuinely disjoint polygons untouched.
 *
 * Holes are preserved: a merged polygon keeps the holes of every ring that
 * went into it (they remain spatially inside the combined outer).
 */
export function unifyWeaklyConnectedPolygons(
  polygons: PolygonWithHoles[]
): PolygonWithHoles[] {
  if (polygons.length < 2) {
    return polygons;
  }

  const outers = polygons.map((p) => p.outer);
  const groups = groupTouchingOuters(outers);

  // Nothing touches — every polygon is its own group; return as-is.
  if (groups.length === polygons.length) {
    return polygons;
  }

  return groups.map((group) => {
    if (group.length === 1) {
      return polygons[group[0]];
    }

    let outer = polygons[group[0]].outer;
    for (let k = 1; k < group.length; k++) {
      outer = spliceTwoRings(outer, polygons[group[k]].outer);
    }

    const holes = group.flatMap((idx) => polygons[idx].holes ?? []);
    return holes.length ? { outer, holes } : { outer };
  });
}

/**
 * Resolve a single (possibly self-intersecting) closed polyline into one
 * weakly-simple ring whose path traverses every section.
 *
 * Used by the freehand draw loop so a hand-drawn figure-eight is stored as one
 * contour instead of losing a lobe. A simple (non-self-intersecting) polyline
 * is returned untouched, so normal contours keep their exact drawn points.
 */
export function bridgeSelfIntersectingPolyline(
  line: Types.Point2[]
): Types.Point2[] {
  const polygons = splitSelfIntersections(line);

  // No self-intersection to resolve — leave the drawn points exactly as-is.
  if (polygons.length === 0) {
    return line;
  }
  if (polygons.length === 1 && !polygons[0].holes?.length) {
    return line;
  }

  const unified = unifyWeaklyConnectedPolygons(polygons);

  // A continuous stroke yields one connected region; pick the largest in the
  // unlikely event of stray pieces, then fold any holes into the outer so the
  // whole shape is expressible as a single ring.
  const main = unified.reduce((largest, candidate) =>
    math.polyline.getArea(candidate.outer) >
    math.polyline.getArea(largest.outer)
      ? candidate
      : largest
  );

  let outer = main.outer;
  for (const hole of main.holes ?? []) {
    outer = spliceTwoRings(outer, hole);
  }
  return outer;
}
