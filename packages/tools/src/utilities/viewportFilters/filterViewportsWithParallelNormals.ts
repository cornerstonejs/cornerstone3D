import { vec3 } from 'gl-matrix';
import getViewportSpatialCamera from '../getViewportSpatialCamera';

/**
 * It filters the viewports that are looking in the same view as the camera
 * It basically checks if the viewPlaneNormal is parallel to the camera viewPlaneNormal
 * @param viewports - Array of viewports to filter
 * @param camera - Camera to compare against
 * @returns - Array of viewports with the same view
 */
export function filterViewportsWithParallelNormals(
  viewports,
  referenceViewport,
  EPS = 0.999
) {
  const referenceCamera = getViewportSpatialCamera(referenceViewport);
  const referenceNormal = referenceCamera.viewPlaneNormal;

  if (!referenceNormal) {
    return [];
  }

  return viewports.filter((viewport) => {
    const vpCamera = getViewportSpatialCamera(viewport);

    if (!vpCamera.viewPlaneNormal) {
      return false;
    }

    const isParallel =
      Math.abs(vec3.dot(vpCamera.viewPlaneNormal, referenceNormal)) > EPS;

    return isParallel;
  });
}

export default filterViewportsWithParallelNormals;
