import { getRenderingEngine, Types } from '@ohif/cornerstone-render'

/**
 * @function cameraSyncCallback - Synchronizer callback to synchronize the camera. Synchronization
 *
 * @param {object} synchronizerInstance The Instance of the Synchronizer
 * @param {IViewportUID} sourceViewport The list of UIDs defining the source viewport.
 * @param {IViewportUID} targetViewport The list of UIDs defining the target viewport.
 * @param {CustomEvent} cameraModifiedEvent The CAMERA_MODIFIED event.
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
    sourceViewport.sceneUID === targetViewport.sceneUID &&
    sourceViewport.viewportUID === targetViewport.viewportUID
  ) {
    return
  }

  const { camera } = cameraModifiedEvent.detail

  const renderingEngine = getRenderingEngine(targetViewport.renderingEngineUID)
  if (!renderingEngine) {
    throw new Error(`No RenderingEngine for UID: ${targetViewport.renderingEngineUID}`)
  }

  const tViewport = renderingEngine.getViewport(targetViewport.viewportUID)

  // TODO: only sync in-plane movements if one viewport is a stack viewport

  tViewport.setCamera(camera)
  tViewport.render()
}
