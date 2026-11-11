import type { ActorEntry } from '../../../types';

/**
 * Whether an actor is excluded from viewport fidelity (FIDELITY-STATE-9).
 *
 * Tools set `excludeFromFidelity` on labelmap / segmentation overlay actors.
 * Generic viewports use the same flag on the rendering from the binding role.
 */
export function isLabelmapActorEntry(entry: ActorEntry): boolean {
  return entry.excludeFromFidelity === true;
}
