import { getEnabledElementByViewportId, type Types } from '@cornerstonejs/core';
import { SegmentationRepresentations } from '../../../enums';

/**
 * Get the labelmap actor for a given segmentation id.
 *
 * @param viewportId - The viewport id.
 * @param segmentationId - The segmentation id.
 * @returns The labelmap actor.
 */
export function getLabelmapActor(
  viewportId: string,
  segmentationId: string
): Types.VolumeActor | Types.ImageActor | undefined {
  const enabledElement = getEnabledElementByViewportId(viewportId);
  const { renderingEngine, viewport } = enabledElement;

  if (!renderingEngine || !viewport) {
    return;
  }

  const actors = viewport.getActors();

  const actor = actors.find(
    (actor) => actor.uid === getLabelmapActorUID(segmentationId)
  );

  if (!actor) {
    return;
  }

  return actor.actor as Types.VolumeActor | Types.ImageActor;
}

export function getLabelmapActorUID(segmentationId: string) {
  return `${segmentationId}-${SegmentationRepresentations.Labelmap}`;
}
