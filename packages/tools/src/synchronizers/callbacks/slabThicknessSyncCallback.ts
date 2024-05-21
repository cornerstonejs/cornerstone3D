import { getRenderingEngine, Types } from '@cornerstonejs/core';

/**
 * Synchronizer callback to synchronize the slab thickness.
 */
export default function slabThicknessSyncCallback(
  _synchronizerInstance,
  sourceViewport: Types.IViewportId,
  targetViewport: Types.IViewportId
): void {
  const renderingEngine = getRenderingEngine(targetViewport.renderingEngineId);
  if (!renderingEngine) {
    throw new Error(
      `No RenderingEngine for Id: ${targetViewport.renderingEngineId}`
    );
  }

  const tViewport = renderingEngine.getViewport(targetViewport.viewportId);
  const sViewport = renderingEngine.getViewport(sourceViewport.viewportId);

  const slabThickness = (
    sViewport as Types.IVolumeViewport
  ).getSlabThickness?.();
  if (!slabThickness) {
    return;
  }
  (tViewport as Types.IVolumeViewport).setSlabThickness?.(slabThickness);
  tViewport.render();
}
