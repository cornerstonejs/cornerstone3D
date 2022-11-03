import { vec3 } from 'gl-matrix';

/**
 * It filters the viewports that are looking in the same view as the camera
 * It basically checks if the viewPlaneNormal is parallel to the camera viewPlaneNormal
 * @param viewports - Array of viewports to filter
 * @param camera - Camera to compare against
 * @returns - Array of viewports with the same view
 */
export function filterViewportsWithParallelNormals(
  viewports,
  camera,
  EPS = 0.999
) {
  return viewports.filter((viewport) => {
    const vpCamera = viewport.getCamera();

    const isParallel =
      Math.abs(vec3.dot(vpCamera.viewPlaneNormal, camera.viewPlaneNormal)) >
      EPS;

    return isParallel;
  });
}

export default filterViewportsWithParallelNormals;
