import type { PolylineInfoCanvas } from './polylineInfoTypes';
import { runBooleanOpByView } from './polylineSetOps';
import { BooleanOp } from './clipperBooleanOps';

/**
 * XOR (symmetric difference) of two sets of polylines: areas covered by
 * exactly one of the two sets. Clipper computes this in a single pass; we
 * no longer compose subtract twice.
 */
export function xorPolylinesSets(
  polylinesSetA: PolylineInfoCanvas[],
  polylinesSetB: PolylineInfoCanvas[]
): PolylineInfoCanvas[] {
  return runBooleanOpByView(polylinesSetA, polylinesSetB, BooleanOp.Xor);
}
