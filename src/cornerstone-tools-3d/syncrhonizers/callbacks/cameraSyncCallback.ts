import { getRenderingEngine } from '../../../index';

/**
 * cameraSync - Synchronizer callback design to synchronize the camera. Synchronization
 */
export default function cameraSync(
  synchronizerInstance,
  sourceViewport,
  targetViewport,
  cameraUpdatedEvent
) {
  // We need a helper for this
  if (
    sourceViewport.renderingEngineUID === targetViewport.renderingEngineUID &&
    sourceViewport.sceneUID === targetViewport.sceneUID &&
    sourceViewport.viewportUID === targetViewport.viewportUID
  ) {
    return;
  }

  const { camera } = cameraUpdatedEvent.detail;

  const tViewport = getRenderingEngine(targetViewport.renderingEngineUID)
    .getScene(targetViewport.sceneUID)
    .getViewport(targetViewport.viewportUID);

  tViewport.setCamera(camera);

  tViewport.render();
}

export { cameraSync };
