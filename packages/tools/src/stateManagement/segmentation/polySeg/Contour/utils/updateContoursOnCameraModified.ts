import { utilities, type Types, Enums } from '@cornerstonejs/core';
import { extractContourData } from './extractContourData';
import { clipAndCacheSurfacesForViewport } from '../../../helpers/clipAndCacheSurfacesForViewport';
import { createAndAddContourSegmentationsFromClippedSurfaces } from './createAndAddContourSegmentationsFromClippedSurfaces';

const currentViewportNormal = new Map();

export function updateContoursOnCameraModified(
  surfacesInfo,
  viewport,
  segmentationRepresentationUID
) {
  async function cameraModifiedCallback(
    evt: Types.EventTypes.CameraModifiedEvent
  ) {
    const { camera } = evt.detail;
    const { viewPlaneNormal } = camera;

    // Note: I think choosing one of the surfaces to see
    // if the viewPlaneNormal is the same for all surfaces is ok enough
    // to decide if we should recompute the clipping planes
    const surface1 = surfacesInfo[0];

    const currentNormal = currentViewportNormal.get(surface1.id);
    if (utilities.isEqual(viewPlaneNormal, currentNormal)) {
      return;
    }
    currentViewportNormal.set(surface1.id, viewPlaneNormal);

    const polyDataCache = await clipAndCacheSurfacesForViewport(
      surfacesInfo,
      viewport as Types.IVolumeViewport,
      segmentationRepresentationUID
    );

    const results = extractContourData(polyDataCache);

    createAndAddContourSegmentationsFromClippedSurfaces(
      results,
      viewport,
      segmentationRepresentationUID
    );

    viewport.render();
  }

  const camera = viewport.getCamera();
  currentViewportNormal.set(surfacesInfo[0].id, camera.viewPlaneNormal);

  // Remove the existing event listener
  viewport.element.removeEventListener(
    Enums.Events.CAMERA_MODIFIED,
    cameraModifiedCallback
  );

  // Add the event listener
  viewport.element.addEventListener(Enums.Events.CAMERA_MODIFIED);
}
