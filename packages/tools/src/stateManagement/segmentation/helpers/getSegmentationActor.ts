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
export function getSegmentationActor(
  viewportId: string,
  specifier: {
    segmentationId: string;
    type: SegmentationRepresentations;
  }
): Types.VolumeActor | Types.ImageActor | undefined {
  if (specifier.type === SegmentationRepresentations.Contour) {
    throw new Error('Contours do not have actors');
  }

  const enabledElement = getEnabledElementByViewportId(viewportId);
  const { renderingEngine, viewport } = enabledElement;

  if (!renderingEngine || !viewport) {
    return;
  }

  const actors = viewport.getActors();

  const actorUID =
    specifier.type === SegmentationRepresentations.Labelmap
      ? getLabelmapActorUID(specifier.segmentationId)
      : getSurfaceActorUID(specifier.segmentationId);

  const actor = actors.find((actor) => actor.uid === actorUID);

  if (!actor) {
    return;
  }

  return actor.actor as Types.VolumeActor | Types.ImageActor;
}

export function getLabelmapActorUID(segmentationId: string) {
  return `${segmentationId}-${SegmentationRepresentations.Labelmap}`;
}

export function getSurfaceActorUID(segmentationId: string) {
  return `${segmentationId}-${SegmentationRepresentations.Surface}`;
}
