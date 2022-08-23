import { getRenderingEngine, Types } from '@cornerstonejs/core';
import { Synchronizer } from '../../store';

/**
 * Synchronizer callback to synchronize the camera. Synchronization
 *
 * targetViewport.options.syncZoom set to false to not sync the zoom
 * targetViewport.options.syncPan set to false to not sync the pan

 * @param synchronizerInstance - The Instance of the Synchronizer
 * @param sourceViewport - The list of IDs defining the source viewport.
 * @param targetViewport - The list of IDs defining the target viewport, different
 *   from sourceViewport
 */
export default function zoomPanSyncCallback(
  synchronizerInstance: Synchronizer,
  sourceViewport: Types.IViewportId,
  targetViewport: Types.IViewportId
): void {
  const renderingEngine = getRenderingEngine(targetViewport.renderingEngineId);
  if (!renderingEngine) {
    throw new Error(
      `No RenderingEngine for Id: ${targetViewport.renderingEngineId}`
    );
  }

  const options = synchronizerInstance.getOptions(targetViewport.viewportId);

  const tViewport = renderingEngine.getViewport(targetViewport.viewportId);
  const sViewport = renderingEngine.getViewport(sourceViewport.viewportId);

  if (options?.syncZoom !== false) {
    const srcZoom = sViewport.getZoom();
    // Do the zoom first, as the pan is relative to the zoom level
    tViewport.setZoom(srcZoom);
  }
  if (options?.syncPan !== false) {
    const srcPan = sViewport.getPan();
    tViewport.setPan(srcPan);
  }

  tViewport.render();
}
