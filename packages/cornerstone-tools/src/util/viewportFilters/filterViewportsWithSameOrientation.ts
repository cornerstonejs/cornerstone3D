import isEqual from '../math/vec3/isEqual'

export function filterViewportsWithSameOrientation(viewports, camera) {
  return viewports.filter(viewport => {
    const vpCamera = viewport.getCamera()

    // TODO: do we need any other checks, or is this sufficient?
    return (
      isEqual(vpCamera.viewPlaneNormal, camera.viewPlaneNormal) &&
      isEqual(vpCamera.viewUp, camera.viewUp)
    )
  });
}

export default filterViewportsWithSameOrientation
