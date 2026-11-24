import {
  displaySetRegistry,
  Enums,
  getEnabledElements,
  type Types,
} from '@cornerstonejs/core';
import type { VolumeViewport3D } from '@cornerstonejs/core';
import SegmentationRepresentations from '../../../enums/SegmentationRepresentations';
import { getSurfaceRepresentationUID } from '../../../stateManagement/segmentation/helpers/getSegmentationActor';
import { resetViewportCamera } from '../../../utilities/setViewportCamera';

/**
 * Whether a surface goes on the viewport as a geometry display set: a next
 * 3D viewport.
 */
function showsSurfacesAsDisplaySets(
  viewport: Types.IViewport
): viewport is VolumeViewport3D {
  return viewport.type === Enums.ViewportType.VOLUME_3D;
}

/**
 * Shows a surface of a segmentation on a next 3D viewport as a geometry
 * display set, under the id of its geometry. The colour and the visibility of
 * the surface are the appearance of the display set. The first call on a
 * viewport, whose actors have no entry of the surface, mounts the display
 * set, registered with its segmentation so that its actor entry carries the
 * representation UID, and fits the camera, as the legacy viewport does for a
 * new surface. A later call sets the appearance only: the display set draws
 * the points and the polys of its geometry at each render.
 *
 * @param viewport - The next 3D viewport.
 * @param geometryId - The id of the cached geometry of the surface.
 * @param surface - The surface, with its colour and its visibility.
 * @param segmentationId - The id of the segmentation of the surface.
 */
async function addOrUpdateSurfaceDisplaySet(
  viewport: VolumeViewport3D,
  geometryId: string,
  surface: Types.ISurface,
  segmentationId: string
): Promise<void> {
  const representationUID = getSurfaceRepresentationUID(
    segmentationId,
    surface.segmentIndex
  );

  viewport.setDisplaySetAppearance(geometryId, {
    color: surface.color,
    visible: surface.visible !== false,
  });

  if (
    viewport
      .getActors()
      .some((entry) => entry.representationUID === representationUID)
  ) {
    return;
  }

  displaySetRegistry.add(geometryId, {
    geometryId,
    reference: {
      kind: 'segmentation',
      segmentationId,
      representationUID,
    },
  });
  await viewport.addDisplaySet(geometryId, {
    role: 'overlay',
  });
  resetViewportCamera(viewport);
}

/**
 * Whether a viewport of any rendering engine shows the display set of an id.
 */
function isShownOnAViewport(displaySetId: string): boolean {
  return getEnabledElements().some(({ viewport }) =>
    (viewport as Partial<VolumeViewport3D>)
      .getActors?.()
      .some(({ referencedId }) => referencedId === displaySetId)
  );
}

/**
 * Takes the surfaces of a segmentation off a next 3D viewport: every geometry
 * display set whose actor entry carries a Surface representation UID of the
 * segmentation, with its registration when no other viewport shows it.
 *
 * @param viewport - The next 3D viewport.
 * @param segmentationId - The id of the segmentation.
 */
function removeSurfaceDisplaySets(
  viewport: VolumeViewport3D,
  segmentationId: string
): void {
  const prefix = `${segmentationId}-${SegmentationRepresentations.Surface}-`;

  viewport.getActors().forEach(({ representationUID, referencedId }) => {
    if (
      !referencedId ||
      typeof representationUID !== 'string' ||
      !representationUID.startsWith(prefix)
    ) {
      return;
    }

    viewport.removeDisplaySet(referencedId);

    if (!isShownOnAViewport(referencedId)) {
      displaySetRegistry.remove(referencedId);
    }
  });
}

export {
  addOrUpdateSurfaceDisplaySet,
  removeSurfaceDisplaySets,
  showsSurfacesAsDisplaySets,
};
