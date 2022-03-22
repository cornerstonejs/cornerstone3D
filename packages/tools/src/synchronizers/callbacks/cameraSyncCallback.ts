import { getRenderingEngine, Types } from '@cornerstonejs/core'

/**
 * Synchronizer callback to synchronize the camera. Synchronization
 *
 * @param synchronizerInstance - The Instance of the Synchronizer
 * @param sourceViewport - The list of UIDs defining the source viewport.
 * @param targetViewport - The list of UIDs defining the target viewport.
 * @param cameraModifiedEvent - The CAMERA_MODIFIED event.
 */
export default function cameraSyncCallback(
  synchronizerInstance,
  sourceViewport: Types.IViewportUID,
  targetViewport: Types.IViewportUID,
  cameraModifiedEvent: CustomEvent
): void {
  // We need a helper for this
  if (
    sourceViewport.renderingEngineUID === targetViewport.renderingEngineUID &&
    sourceViewport.viewportUID === targetViewport.viewportUID
  ) {
    return
  }

  const { camera } = cameraModifiedEvent.detail

  const renderingEngine = getRenderingEngine(targetViewport.renderingEngineUID)
  if (!renderingEngine) {
    throw new Error(
      `No RenderingEngine for UID: ${targetViewport.renderingEngineUID}`
    )
  }

  const tViewport = renderingEngine.getViewport(targetViewport.viewportUID)

  // TODO: only sync in-plane movements if one viewport is a stack viewport

  // Todo: we shouldn't set camera, we should set the focalPoint
  // to the nearest slice center world position
  tViewport.setCamera(camera)
  tViewport.render()
}
