import type { PolylineInfoCanvas } from './polylineInfoTypes';
import { runBooleanOpByView } from './polylineSetOps';
import { BooleanOp } from './clipperBooleanOps';

/**
 * Intersect two sets of polylines. Returns polygons (with holes) representing
 * overlapping regions between the two sets, grouped by view reference.
 *
 * Clipper handles all spatial relationships uniformly:
 * - Disjoint polygons → empty result
 * - Edge crossings → intersection region
 * - One polygon fully inside another → the inner polygon
 * - Holes in either input are subtracted from the intersection naturally
 */
export function intersectPolylinesSets(
  set1: PolylineInfoCanvas[],
  set2: PolylineInfoCanvas[]
): PolylineInfoCanvas[] {
  return runBooleanOpByView(set1, set2, BooleanOp.Intersection);
}
