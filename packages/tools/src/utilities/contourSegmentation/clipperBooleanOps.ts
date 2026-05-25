/**
 * Thin wrapper around clipper2-ts that operates on cornerstone3D Point2 polygons
 * with optional holes, returning hole-aware results via Clipper's PolyTreeD.
 *
 * All input/output polygons are in canvas space. View references and segmentation
 * metadata are NOT handled here — callers must group by view reference before
 * invoking these functions.
 */

import type { Types } from '@cornerstonejs/core';
import {
  Clipper,
  ClipType,
  FillRule,
  PolyTreeD,
  type PathD,
  type PathsD,
  type PolyPathD,
} from 'clipper2-ts';

/** Decimal places preserved by Clipper. Canvas pixel coords don't need more. */
const PRECISION = 4;

export type PolygonWithHoles = {
  outer: Types.Point2[];
  holes?: Types.Point2[][];
};

export enum BooleanOp {
  Union,
  Difference,
  Intersection,
  Xor,
}

const opToClipType: Record<BooleanOp, ClipType> = {
  [BooleanOp.Union]: ClipType.Union,
  [BooleanOp.Difference]: ClipType.Difference,
  [BooleanOp.Intersection]: ClipType.Intersection,
  [BooleanOp.Xor]: ClipType.Xor,
};

function point2ToPathD(polyline: Types.Point2[]): PathD {
  const len = polyline.length;
  const out: PathD = new Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = { x: polyline[i][0], y: polyline[i][1] };
  }
  return out;
}

function pathDToPoint2(path: PathD): Types.Point2[] {
  const len = path.length;
  const out: Types.Point2[] = new Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = [path[i].x, path[i].y];
  }
  return out;
}

function polygonsToPathsD(polygons: PolygonWithHoles[]): PathsD {
  const paths: PathsD = [];
  for (const p of polygons) {
    if (p.outer.length >= 3) {
      paths.push(point2ToPathD(p.outer));
    }
    if (p.holes) {
      for (const hole of p.holes) {
        if (hole.length >= 3) {
          paths.push(point2ToPathD(hole));
        }
      }
    }
  }
  return paths;
}

/**
 * Walk a PolyTreeD into a flat list of PolygonWithHoles.
 *
 * In Clipper's PolyTree, the root's direct children are outer rings (isHole=false).
 * Each outer ring's children are holes (isHole=true). A hole can in turn contain
 * nested outer rings (separate polygons sitting inside that hole) — those become
 * top-level entries in our flat output too.
 */
function polyTreeToPolygons(tree: PolyTreeD): PolygonWithHoles[] {
  const out: PolygonWithHoles[] = [];
  collectOuters(tree, out);
  return out;
}

function collectOuters(node: PolyPathD, out: PolygonWithHoles[]): void {
  for (let i = 0; i < node.count; i++) {
    const child = node.child(i);
    if (child.isHole) {
      // Outer-rings nested inside this hole become their own top-level polygons.
      collectOuters(child, out);
      continue;
    }
    const outerPoly = child.poly;
    if (!outerPoly || outerPoly.length < 3) {
      continue;
    }
    const polygon: PolygonWithHoles = { outer: pathDToPoint2(outerPoly) };
    const holes: Types.Point2[][] = [];
    for (let j = 0; j < child.count; j++) {
      const grand = child.child(j);
      if (grand.isHole) {
        const holePoly = grand.poly;
        if (holePoly && holePoly.length >= 3) {
          holes.push(pathDToPoint2(holePoly));
        }
        // Descend further: outer rings nested inside this hole are separate polygons.
        collectOuters(grand, out);
      }
    }
    if (holes.length > 0) {
      polygon.holes = holes;
    }
    out.push(polygon);
  }
}

/** Defensive clone so the caller can mutate the result without aliasing inputs. */
function clonePolygons(polygons: PolygonWithHoles[]): PolygonWithHoles[] {
  return polygons.map((p) => ({
    outer: p.outer.map((pt) => [pt[0], pt[1]] as Types.Point2),
    holes: p.holes?.map((h) => h.map((pt) => [pt[0], pt[1]] as Types.Point2)),
  }));
}

/**
 * Apply a boolean operation between two sets of polygons-with-holes, returning
 * the resulting polygons with hole topology preserved.
 *
 * Empty-input shortcuts avoid invoking Clipper for trivial cases.
 */
export function applyBoolean(
  subjects: PolygonWithHoles[],
  clips: PolygonWithHoles[],
  op: BooleanOp
): PolygonWithHoles[] {
  if (subjects.length === 0) {
    if (op === BooleanOp.Union || op === BooleanOp.Xor) {
      return clonePolygons(clips);
    }
    return [];
  }
  if (clips.length === 0) {
    if (op === BooleanOp.Intersection) {
      return [];
    }
    // Union, Difference, Xor with no clip all return the subject unchanged.
    return clonePolygons(subjects);
  }

  const subjectPaths = polygonsToPathsD(subjects);
  const clipPaths = polygonsToPathsD(clips);

  if (subjectPaths.length === 0) {
    if (op === BooleanOp.Union || op === BooleanOp.Xor) {
      return clonePolygons(clips);
    }
    return [];
  }
  if (clipPaths.length === 0) {
    if (op === BooleanOp.Intersection) {
      return [];
    }
    return clonePolygons(subjects);
  }

  const tree = new PolyTreeD();
  // EvenOdd treats overlapping rings as creating holes regardless of winding,
  // which lets us hand Clipper the outer-and-hole paths in any order.
  Clipper.booleanOpDWithPolyTree(
    opToClipType[op],
    subjectPaths,
    clipPaths,
    tree,
    FillRule.EvenOdd,
    PRECISION
  );

  return polyTreeToPolygons(tree);
}
