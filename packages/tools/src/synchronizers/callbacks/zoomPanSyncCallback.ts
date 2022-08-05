import { getRenderingEngine, Types } from '@cornerstonejs/core';
import { Synchronizer } from '../../store';

/**
 * Synchronizer callback to synchronize the camera. Synchronization
 *
 * The "this" object may contain options to define the behaviour.
 * this.
 * this.syncZoom set to true to sync the zoom
 * this.syncPan set to true to sync the pan
 * Otherwise, raw camera sync
 * @param synchronizerInstance - The Instance of the Synchronizer
 * @param sourceViewport - The list of IDs defining the source viewport.
 * @param targetViewport - The list of IDs defining the target viewport.
 */
export default function cameraSyncCallback(
  synchronizerInstance: Synchronizer,
  sourceViewport: Types.IViewportId,
  targetViewport: Types.IViewportId
): void {
  // We need a helper for this
  if (
    sourceViewport.renderingEngineId === targetViewport.renderingEngineId &&
    sourceViewport.viewportId === targetViewport.viewportId
  ) {
    return;
  }

  const renderingEngine = getRenderingEngine(targetViewport.renderingEngineId);
  if (!renderingEngine) {
    throw new Error(
      `No RenderingEngine for Id: ${targetViewport.renderingEngineId}`
    );
  }

  const tViewport = renderingEngine.getViewport(targetViewport.viewportId);
  const sViewport = renderingEngine.getViewport(sourceViewport.viewportId);

  if (this.syncZoom !== false) {
    const srcZoom = sViewport.getZoom();
    // Do the zoom first, as the pan is relative to the zoom level
    tViewport.setZoom(srcZoom);
  }
  if (this.syncPan !== false) {
    const srcPan = sViewport.getPan();
    tViewport.setPan(srcPan);
  }

  tViewport.render();
}
