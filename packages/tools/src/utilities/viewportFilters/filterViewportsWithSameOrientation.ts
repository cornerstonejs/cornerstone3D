import { utilities as csUtils } from '@cornerstonejs/core';
import getViewportSpatialCamera from '../getViewportSpatialCamera';

export function filterViewportsWithSameOrientation(
  viewports,
  referenceViewport
) {
  const referenceCamera = getViewportSpatialCamera(referenceViewport);

  if (!referenceCamera.viewPlaneNormal || !referenceCamera.viewUp) {
    return [];
  }

  return viewports.filter((viewport) => {
    const vpCamera = getViewportSpatialCamera(viewport);

    if (!vpCamera.viewPlaneNormal || !vpCamera.viewUp) {
      return false;
    }

    // TODO: do we need any other checks, or is this sufficient?
    return (
      csUtils.isEqual(
        vpCamera.viewPlaneNormal,
        referenceCamera.viewPlaneNormal
      ) && csUtils.isEqual(vpCamera.viewUp, referenceCamera.viewUp)
    );
  });
}

export default filterViewportsWithSameOrientation;
