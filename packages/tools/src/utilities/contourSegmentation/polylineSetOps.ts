/**
 * Bridges PolylineInfoCanvas (canvas-space polylines + viewReference + holes)
 * to the pure-geometry clipperBooleanOps. Groups polylines by viewReference,
 * runs Clipper once per group, then flattens back to PolylineInfoCanvas[].
 *
 * View references must match exactly — operations between polylines on
 * different slices/views never combine.
 */

import type { PolylineInfoCanvas } from './polylineInfoTypes';
import { areViewReferencesEqual } from './areViewReferencesEqual';
import {
  applyBoolean,
  BooleanOp,
  type PolygonWithHoles,
} from './clipperBooleanOps';
import type { Types } from '@cornerstonejs/core';

type Group = {
  viewReference: PolylineInfoCanvas['viewReference'];
  polygons: PolygonWithHoles[];
};

function toPolygon(info: PolylineInfoCanvas): PolygonWithHoles {
  return {
    outer: info.polyline,
    holes: info.holePolylines?.length ? info.holePolylines : undefined,
  };
}

function groupByViewReference(set: PolylineInfoCanvas[]): Group[] {
  const groups: Group[] = [];
  for (const info of set) {
    if (info.polyline.length < 3) {
      continue;
    }
    const existing = groups.find((g) =>
      areViewReferencesEqual(g.viewReference, info.viewReference)
    );
    if (existing) {
      existing.polygons.push(toPolygon(info));
    } else {
      groups.push({
        viewReference: info.viewReference,
        polygons: [toPolygon(info)],
      });
    }
  }
  return groups;
}

function flatten(
  result: PolygonWithHoles[],
  viewReference: PolylineInfoCanvas['viewReference']
): PolylineInfoCanvas[] {
  return result.map((p) => ({
    polyline: p.outer,
    viewReference,
    ...(p.holes?.length ? { holePolylines: p.holes } : {}),
  }));
}

/**
 * Run `op` between two PolylineInfoCanvas sets, grouping by view reference so
 * polygons on different views never interact.
 *
 * - For commutative ops (Union, Xor): subject-only and clip-only view groups
 *   are passed through unchanged.
 * - For Difference: subject groups without a matching clip group pass through;
 *   clip-only groups are dropped (nothing to subtract from).
 * - For Intersection: only groups present on both sides contribute.
 */
export function runBooleanOpByView(
  setA: PolylineInfoCanvas[],
  setB: PolylineInfoCanvas[],
  op: BooleanOp
): PolylineInfoCanvas[] {
  const aGroups = groupByViewReference(setA);
  const bGroups = groupByViewReference(setB);

  const out: PolylineInfoCanvas[] = [];
  const matchedB = new Set<Group>();

  for (const aGroup of aGroups) {
    const bGroup = bGroups.find((g) =>
      areViewReferencesEqual(g.viewReference, aGroup.viewReference)
    );
    if (bGroup) {
      matchedB.add(bGroup);
      const result = applyBoolean(aGroup.polygons, bGroup.polygons, op);
      out.push(...flatten(result, aGroup.viewReference));
    } else if (op === BooleanOp.Intersection) {
      // No matching clip → empty.
    } else {
      // Union / Xor / Difference with empty clip: subjects unchanged.
      out.push(...flatten(aGroup.polygons, aGroup.viewReference));
    }
  }

  // B-only groups: only meaningful for Union and Xor.
  if (op === BooleanOp.Union || op === BooleanOp.Xor) {
    for (const bGroup of bGroups) {
      if (matchedB.has(bGroup)) {
        continue;
      }
      out.push(...flatten(bGroup.polygons, bGroup.viewReference));
    }
  }

  return out;
}
