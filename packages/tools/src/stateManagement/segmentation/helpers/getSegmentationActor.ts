import { getEnabledElementByViewportId, type Types } from '@cornerstonejs/core';
import { SegmentationRepresentations } from '../../../enums';

/**
 * Retrieves the segmentation actor for a given viewport and segmentation specification.
 *
 * @param viewportId - The ID of the viewport.
 * @param specifier - An object containing the segmentation ID and type.
 * @param specifier.segmentationId - The ID of the segmentation.
 * @param specifier.type - The type of segmentation representation.
 * @returns The segmentation actor as a VolumeActor or ImageActor, or undefined if not found.
 * @throws Error if the segmentation type is Contour, as contours do not have actors.
 */
export function getSegmentationActorEntry(
  viewportId: string,
  specifier: {
    segmentationId: string;
    type: SegmentationRepresentations;
    segmentIndex?: number;
  }
): Types.ActorEntry | undefined {
  if (specifier.type === SegmentationRepresentations.Contour) {
    throw new Error('Contours do not have actors');
  }

  const enabledElement = getEnabledElementByViewportId(viewportId);
  const { renderingEngine, viewport } = enabledElement;

  if (!renderingEngine || !viewport) {
    return;
  }

  const actors = viewport.getActors();

  let actorUID: string;
  switch (specifier.type) {
    case SegmentationRepresentations.Labelmap:
      actorUID = getLabelmapActorUID(specifier.segmentationId);
      break;
    case SegmentationRepresentations.Surface:
      if (specifier.segmentIndex === undefined) {
        throw new Error(
          'Segment index must be provided for Surface representation'
        );
      }
      actorUID = getSurfaceActorUID(
        specifier.segmentationId,
        specifier.segmentIndex
      );
      break;
    default:
      throw new Error('Invalid segmentation representation type');
  }

  const actor = actors.find((actor) => actor.uid === actorUID);

  if (!actor) {
    return;
  }

  return actor;
}

export function getLabelmapActorUID(segmentationId: string) {
  return `${segmentationId}-${SegmentationRepresentations.Labelmap}`;
}

export function getSurfaceActorUID(
  segmentationId: string,
  segmentIndex: number
) {
  return `${segmentationId}-${SegmentationRepresentations.Surface}-${segmentIndex}`;
}

/**
 * Filters surface actors for a given segmentation ID.
 *
 * @param actors - Array of actor entries to filter.
 * @param segmentationId - ID of the segmentation to filter by.
 * @returns Filtered array of surface actors for the given segmentation.
 */
export function filterSurfaceActors(
  actors: Types.ActorEntry[],
  segmentationId: string
): Types.ActorEntry[] {
  const prefix = `${segmentationId}-${SegmentationRepresentations.Surface}-`;
  return actors.filter((actor) => actor.uid.startsWith(prefix));
}
