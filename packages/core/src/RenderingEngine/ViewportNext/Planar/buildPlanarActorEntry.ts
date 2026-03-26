import type { ActorEntry } from '../../../types';
import type { LoadedData } from '../ViewportArchitectureTypes';
import type { PlanarPayload } from './PlanarViewportTypes';

/**
 * Builds an ActorEntry from a planar data payload and the render-path-specific
 * actor/mapper. This consolidates the UID/referencedId fallback chain shared
 * across all four planar render modes.
 */
export function buildPlanarActorEntry(
  data: LoadedData<PlanarPayload>,
  source: {
    actor: unknown;
    mapper?: unknown;
    renderMode: string;
    uidFallback?: string;
    referencedIdFallback?: string;
  }
): ActorEntry {
  const uid =
    data.actorUID ||
    data.representationUID ||
    data.referencedId ||
    source.uidFallback ||
    data.id;

  const referencedId =
    data.referencedId || source.referencedIdFallback || data.id;

  const actor = source.actor;
  const mapper =
    source.mapper ??
    (typeof (actor as { getMapper?: () => unknown }).getMapper === 'function'
      ? (actor as { getMapper: () => unknown }).getMapper()
      : undefined);

  return {
    uid,
    actor,
    actorMapper: {
      actor,
      mapper,
      renderMode: source.renderMode,
    },
    referencedId,
    ...(data.representationUID
      ? { representationUID: data.representationUID }
      : {}),
  };
}
