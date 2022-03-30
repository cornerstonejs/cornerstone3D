import { getRenderingEngine, Types } from '@cornerstonejs/core';

/**
 * Synchronizer callback to synchronize the camera. Synchronization
 *
 * @param synchronizerInstance - The Instance of the Synchronizer
 * @param sourceViewport - The list of IDs defining the source viewport.
 * @param targetViewport - The list of IDs defining the target viewport.
 * @param cameraModifiedEvent - The CAMERA_MODIFIED event.
 */
export default function cameraSyncCallback(
  synchronizerInstance,
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

  // Todo: we shouldn't set camera, we should set the focalPoint
  // to the nearest slice center world position
  tViewport.setCamera(camera);
  tViewport.render();
}
