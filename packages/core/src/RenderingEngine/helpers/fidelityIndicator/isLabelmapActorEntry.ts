import type { ActorEntry } from '../../../types';

/**
 * Whether an actor is a labelmap overlay (FIDELITY-SCOPE-3). Tools set
 * `representationUID` to `${segmentationId}-Labelmap-...`.
 */
export function isLabelmapActorEntry(entry: ActorEntry): boolean {
  const id = entry.representationUID ?? entry.uid;
  return typeof id === 'string' && /(?:^|-)Labelmap(?:-|$)/.test(id);
}
