import { getEnabledElementByViewportId } from '@cornerstonejs/core';
import { SegmentationRepresentations } from '../../../enums';

/**
 * Retrieves the actor entry based on the given criteria.
 * @param viewportId - The ID of the viewport.
 * @param segmentationId - The ID of the segmentation.
 * @param filterFn - A function to filter the actors.
 * @returns The actor entry if found, undefined otherwise.
 */
function getActorEntry(
  viewportId: string,
  segmentationId: string,
  filterFn: (actor: unknown) => boolean
) {
  const enabledElement = getEnabledElementByViewportId(viewportId);

  if (!enabledElement) {
    return;
  }

  const { renderingEngine, viewport } = enabledElement;

  if (!renderingEngine || !viewport) {
    return;
  }

  const actors = viewport.getActors();
  const filteredActors = actors.filter(filterFn);

  return filteredActors.length > 0 ? filteredActors[0] : undefined;
}

/**
 * Retrieves the UID of the labelmap actor for the given viewport and segmentation.
 * @param viewportId - The ID of the viewport.
 * @param segmentationId - The ID of the segmentation.
 * @returns The UID of the labelmap actor if found, undefined otherwise.
 */
export function getLabelmapActorUID(
  viewportId: string,
  segmentationId: string
): string | undefined {
  const actorEntry = getLabelmapActorEntry(viewportId, segmentationId);
  return actorEntry?.uid;
}

/**
 * Retrieves the labelmap actor entry for the given viewport and segmentation.
 * @param viewportId - The ID of the viewport.
 * @param segmentationId - The ID of the segmentation.
 * @returns The labelmap actor entry if found, undefined otherwise.
 */
export function getLabelmapActorEntry(
  viewportId: string,
  segmentationId: string
) {
  return getActorEntry(viewportId, segmentationId, (actor) =>
    // @ts-expect-error
    actor.representationUID?.startsWith(
      `${segmentationId}-${SegmentationRepresentations.Labelmap}`
    )
  );
}

/**
 * Retrieves the surface actor entry for the given viewport, segmentation, and segment index.
 * @param viewportId - The ID of the viewport.
 * @param segmentationId - The ID of the segmentation.
 * @param segmentIndex - The index of the segment.
 * @returns The surface actor entry if found, undefined otherwise.
 */
export function getSurfaceActorEntry(
  viewportId: string,
  segmentationId: string,
  segmentIndex?: number | string
) {
  return getActorEntry(viewportId, segmentationId, (actor) =>
    // @ts-expect-error
    actor.representationUID?.startsWith(
      `${segmentationId}-${SegmentationRepresentations.Surface}-${segmentIndex}`
    )
  );
}

/**
 * Retrieves the UID of the surface actor for the given viewport, segmentation, and segment index.
 * @param viewportId - The ID of the viewport.
 * @param segmentationId - The ID of the segmentation.
 * @param segmentIndex - The index of the segment.
 * @returns The UID of the surface actor if found, undefined otherwise.
 */
export function getSurfaceActorUID(
  viewportId: string,
  segmentationId: string,
  segmentIndex?: number | string
): string | undefined {
  const segIndex = segmentIndex ? segmentIndex.toString() : '';

  const actorEntry = getSurfaceActorEntry(viewportId, segmentationId, segIndex);
  return actorEntry?.uid;
}
