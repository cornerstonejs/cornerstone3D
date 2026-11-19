import type {
  Types,
  PlanarViewport,
  VolumeViewport3D,
} from '@cornerstonejs/core';
import { getEnabledElementByViewportId } from '@cornerstonejs/core';
import { SegmentationRepresentations } from '../../../enums';
import {
  getSurfaceSlicePropEntry,
  showsSurfacesAsSliceProps,
} from '../../../tools/displayTools/Surface/surfaceSliceProps';

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
  filterFn: (actor: Types.ActorEntry) => boolean
): Types.ActorEntry | undefined {
  const enabledElement = getEnabledElementByViewportId(viewportId);

  if (!enabledElement) {
    return;
  }

  const { renderingEngine, viewport } = enabledElement;

  if (!renderingEngine || !viewport) {
    return;
  }

  const actors = (viewport as PlanarViewport | VolumeViewport3D).getActors();
  const filteredActors = actors.filter(filterFn);

  return filteredActors.length > 0 ? filteredActors[0] : undefined;
}

/**
 * Retrieves the actor entry based on the given criteria.
 * @param viewportId - The ID of the viewport.
 * @param segmentationId - The ID of the segmentation.
 * @param filterFn - A function to filter the actors.
 * @returns The actor entry if found, undefined otherwise.
 */
function getActorEntries(
  viewportId: string,
  filterFn: (actor: Types.ActorEntry) => boolean
): Types.ActorEntry[] | undefined {
  const enabledElement = getEnabledElementByViewportId(viewportId);

  if (!enabledElement) {
    return;
  }

  const { renderingEngine, viewport } = enabledElement;

  if (!renderingEngine || !viewport) {
    return;
  }

  const actors = (viewport as PlanarViewport | VolumeViewport3D).getActors();
  const filteredActors = actors.filter(filterFn);

  return filteredActors.length > 0 ? filteredActors : undefined;
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
 * Retrieves the labelmap actor entries for the given viewport and segmentation.
 * @param viewportId - The ID of the viewport.
 * @param segmentationId - The ID of the segmentation.
 * @returns The labelmap actor entry if found, undefined otherwise.
 */
export function getLabelmapActorEntries(
  viewportId: string,
  segmentationId: string
) {
  return getActorEntries(viewportId, (actor) =>
    (actor.representationUID as string)?.startsWith(
      `${segmentationId}-${SegmentationRepresentations.Labelmap}`
    )
  );
}

/**
 * Retrieves the labelmap actor entry for the given viewport and segmentation.
 * @param viewportId - The ID of the viewport.
 * @param segmentationId - The ID of the segmentation.
 * @returns The labelmap actor entry if found, undefined otherwise.
 */
export function getLabelmapActorEntry(
  viewportId: string,
  segmentationId: string,
  referencedId?: string
) {
  return getActorEntry(
    viewportId,
    segmentationId,
    (actor) =>
      (actor.representationUID as string)?.startsWith(
        `${segmentationId}-${SegmentationRepresentations.Labelmap}`
      ) &&
      (!referencedId || actor.referencedId === referencedId)
  );
}

/**
 * Retrieves the surface actor entry for the given viewport, segmentation, and segment index.
 * On a planar viewport it is the entry of the prop that the renderer of the
 * viewport draws for the surface. On a 3D viewport it is the actor entry of
 * the geometry display set of the surface, which `getActors()` lists.
 * @param viewportId - The ID of the viewport.
 * @param segmentationId - The ID of the segmentation.
 * @param segmentIndex - The index of the segment.
 * @returns The surface actor entry if found, undefined otherwise.
 */
export function getSurfaceActorEntry(
  viewportId: string,
  segmentationId: string,
  segmentIndex?: number | string
): Types.ActorEntry | undefined {
  const representationUID = getSurfaceRepresentationUID(
    segmentationId,
    segmentIndex
  );
  const viewport = getEnabledElementByViewportId(viewportId)?.viewport;

  if (viewport && showsSurfacesAsSliceProps(viewport)) {
    return getSurfaceSlicePropEntry(viewport, representationUID);
  }

  return getActorEntry(
    viewportId,
    segmentationId,
    (actor) => actor.representationUID === representationUID
  );
}

/**
 * Generates a unique identifier for a surface representation of a segmentation segment
 * @param segmentationId - The ID of the segmentation
 * @param segmentIndex - Optional index of the specific segment within the segmentation
 * @returns A string UID combining the segmentation ID, surface representation type, and segment index
 */
export function getSurfaceRepresentationUID(
  segmentationId: string,
  segmentIndex?: number | string
) {
  return `${segmentationId}-${SegmentationRepresentations.Surface}-${segmentIndex}`;
}
