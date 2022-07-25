import { getRenderingEngine, Types } from '@cornerstonejs/core';
import { Synchronizer } from '../../store';

/**
 * Synchronizer callback to synchronize the camera. Synchronization
 *
 * TODO - add options to synchronizer to control which camera sync is used,
 * and to allow zoom only sync or zoom+pan, and maybe also flip/rotate sync.
 * @param synchronizerInstance - The Instance of the Synchronizer
 * @param sourceViewport - The list of IDs defining the source viewport.
 * @param targetViewport - The list of IDs defining the target viewport.
 * @param cameraModifiedEvent - The CAMERA_MODIFIED event.
 */
export default function cameraSyncCallback(
  synchronizerInstance: Synchronizer,
  sourceViewport: Types.IViewportId,
  targetViewport: Types.IViewportId,
  cameraModifiedEvent: CustomEvent
): void {
  // We need a helper for this
  if (
    sourceViewport.renderingEngineId === targetViewport.renderingEngineId &&
    sourceViewport.viewportId === targetViewport.viewportId
  ) {
    return;
  }

  const { camera } = cameraModifiedEvent.detail;

  const renderingEngine = getRenderingEngine(targetViewport.renderingEngineId);
  if (!renderingEngine) {
    throw new Error(
      `No RenderingEngine for Id: ${targetViewport.renderingEngineId}`
    );
  }

  const tViewport = renderingEngine.getViewport(targetViewport.viewportId);

  // TODO: only sync in-plane movements if one viewport is a stack viewport
  if (camera.parallelProjection) {
    const sViewport = renderingEngine.getViewport(sourceViewport.viewportId);
    const srcPan = sViewport.getPan();
    const srcZoom = sViewport.getZoom();

    // Do the zoom first, as the pan is relative to the zoom level
    tViewport.setZoom(srcZoom);
    tViewport.setPan(srcPan);
  } else {
    tViewport.setCamera(camera);
  }
  tViewport.render();
}
