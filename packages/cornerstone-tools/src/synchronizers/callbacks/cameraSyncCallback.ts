import { getRenderingEngine } from '@ohif/cornerstone-render'
import IViewportUID from '../../store/IViewportUID'

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
  sourceViewport: IViewportUID,
  targetViewport: IViewportUID,
  cameraModifiedEvent: CustomEvent
) {
  // We need a helper for this
  if (
    sourceViewport.renderingEngineUID === targetViewport.renderingEngineUID &&
    sourceViewport.sceneUID === targetViewport.sceneUID &&
    sourceViewport.viewportUID === targetViewport.viewportUID
  ) {
    return
  }

  const { camera } = cameraModifiedEvent.detail

  const tViewport = getRenderingEngine(targetViewport.renderingEngineUID)
    .getScene(targetViewport.sceneUID)
    .getViewport(targetViewport.viewportUID)

  tViewport.setCamera(camera)
  tViewport.render()
}
