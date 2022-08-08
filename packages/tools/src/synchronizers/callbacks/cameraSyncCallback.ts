import { getRenderingEngine, Types } from '@cornerstonejs/core';
import { Synchronizer } from '../../store';

/**
 * Synchronizer callback to synchronize the camera by updating all camera
 * values.  See also zoomPanSyncCallback
 *
 * @param synchronizerInstance - The Instance of the Synchronizer
 * @param sourceViewport - The list of IDs defining the source viewport.
 * @param targetViewport - The list of IDs defining the target viewport, never
 *   the same as sourceViewport.
 * @param cameraModifiedEvent - The CAMERA_MODIFIED event.
 */
export default function cameraSyncCallback(
  synchronizerInstance: Synchronizer,
  sourceViewport: Types.IViewportId,
  targetViewport: Types.IViewportId,
  cameraModifiedEvent: CustomEvent
): void {
  const { camera } = cameraModifiedEvent.detail;

  const renderingEngine = getRenderingEngine(targetViewport.renderingEngineId);
  if (!renderingEngine) {
    throw new Error(
      `No RenderingEngine for Id: ${targetViewport.renderingEngineId}`
    );
  }

  const tViewport = renderingEngine.getViewport(targetViewport.viewportId);

  tViewport.setCamera(camera);
  tViewport.render();
}
