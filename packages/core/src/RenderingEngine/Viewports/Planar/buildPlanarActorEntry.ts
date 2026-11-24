import type { ActorEntry } from '../../../types';
import type {
  LoadedData,
  ViewportDataReference,
} from '../ViewportArchitectureTypes';
import type { PlanarPayload } from './PlanarViewportTypes';

/**
 * Builds an ActorEntry from a planar data payload and the render-path-specific
 * actor. The entry names its display set (`displaySetId`), so a caller can
 * find its layer in `getRenderPlan()`; semantic derived-data relationships
 * live on `reference`; actor UID stays internal.
 */
export function buildPlanarActorEntry(
  data: LoadedData<PlanarPayload>,
  source: {
    actor: ActorEntry['actor'];
    uid: string;
    referencedIdFallback?: string;
  }
): ActorEntry {
  const referenceFields = getActorEntryReferenceFields(
    data.reference,
    data.volumeId || source.referencedIdFallback
  );

  return {
    uid: source.uid,
    actor: source.actor,
    displaySetId: data.id,
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
      return reference.displaySetId;
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
