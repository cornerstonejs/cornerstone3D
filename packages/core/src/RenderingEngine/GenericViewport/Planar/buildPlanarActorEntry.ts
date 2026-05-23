import type { ActorEntry, ActorMapperProxy } from '../../../types';
import type {
  LoadedData,
  ViewportDataReference,
} from '../ViewportArchitectureTypes';
import type { PlanarPayload } from './PlanarViewportTypes';

/**
 * Builds an ActorEntry from a planar data payload and the render-path-specific
 * actor/mapper. Clean Next dataset identity lives on dataId and semantic
 * derived-data relationships live on `reference`; actor UID stays internal.
 */
export function buildPlanarActorEntry(
  data: LoadedData<PlanarPayload>,
  source: {
    actor: NonNullable<ActorEntry['actorMapper']>['actor'];
    mapper?: NonNullable<ActorEntry['actorMapper']>['mapper'];
    renderMode: NonNullable<ActorEntry['actorMapper']>['renderMode'];
    uid: string;
    referencedIdFallback?: string;
  }
): ActorEntry {
  const referenceFields = getActorEntryReferenceFields(
    data.reference,
    data.volumeId || source.referencedIdFallback
  );

  const actor = source.actor;
  const mapper =
    source.mapper ??
    (typeof (actor as { getMapper?: () => unknown }).getMapper === 'function'
      ? ((actor as { getMapper: () => unknown }).getMapper() as NonNullable<
          ActorEntry['actorMapper']
        >['mapper'])
      : undefined);

  return {
    uid: source.uid,
    actor: actor as ActorEntry['actor'],
    actorMapper: {
      actor,
      mapper,
      renderMode: source.renderMode,
    } as ActorMapperProxy,
    ...referenceFields,
  };
}

function getActorEntryReferenceFields(
  reference: ViewportDataReference | undefined,
  fallbackReferencedId?: string
): {
  reference?: ViewportDataReference;
  referencedId?: string;
  representationUID?: string;
} {
  if (!reference) {
    return fallbackReferencedId ? { referencedId: fallbackReferencedId } : {};
  }

  if (reference.kind === 'segmentation') {
    return {
      reference,
      referencedId:
        reference.labelmapId ??
        reference.representationUID ??
        reference.segmentationId,
      ...(reference.representationUID
        ? { representationUID: reference.representationUID }
        : {}),
    };
  }

  return {
    reference,
    referencedId: getReferenceId(reference),
  };
}

function getReferenceId(reference: Exclude<ViewportDataReference, undefined>) {
  switch (reference.kind) {
    case 'data':
      return reference.dataId;
    case 'image':
      return reference.imageId;
    case 'volume':
      return reference.volumeId;
    case 'geometry':
      return reference.geometryId;
    case 'segmentation':
      return (
        reference.labelmapId ??
        reference.representationUID ??
        reference.segmentationId
      );
  }
}
