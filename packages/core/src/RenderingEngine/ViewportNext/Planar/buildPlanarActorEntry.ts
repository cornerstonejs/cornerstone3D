import type { ActorEntry, ActorMapperProxy } from '../../../types';
import type { LoadedData } from '../ViewportArchitectureTypes';
import type { PlanarPayload } from './PlanarViewportTypes';

/**
 * Builds an ActorEntry from a planar data payload and the render-path-specific
 * actor/mapper. Payload identity is the public contract for overlays and
 * segmentations; render-path fallbacks are used only when the payload does not
 * provide its own ids.
 */
export function buildPlanarActorEntry(
  data: LoadedData<PlanarPayload>,
  source: {
    actor: NonNullable<ActorEntry['actorMapper']>['actor'];
    mapper?: NonNullable<ActorEntry['actorMapper']>['mapper'];
    renderMode: NonNullable<ActorEntry['actorMapper']>['renderMode'];
    uidFallback?: string;
    referencedIdFallback?: string;
  }
): ActorEntry {
  const uid =
    data.actorUID || data.representationUID || source.uidFallback || data.id;

  const referencedId =
    data.referencedId ||
    data.volumeId ||
    source.referencedIdFallback ||
    data.id;

  const actor = source.actor;
  const mapper =
    source.mapper ??
    (typeof (actor as { getMapper?: () => unknown }).getMapper === 'function'
      ? ((actor as { getMapper: () => unknown }).getMapper() as NonNullable<
          ActorEntry['actorMapper']
        >['mapper'])
      : undefined);

  return {
    uid,
    actor: actor as ActorEntry['actor'],
    actorMapper: {
      actor,
      mapper,
      renderMode: source.renderMode,
    } as ActorMapperProxy,
    referencedId,
    ...(data.representationUID
      ? { representationUID: data.representationUID }
      : {}),
  };
}
