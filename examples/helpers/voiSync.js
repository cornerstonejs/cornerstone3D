import { getRenderingEngine } from './../../src/index';

export default function cameraFocalPointAndPositionSync(
  synchronizerInstance,
  sourceViewport,
  targetViewport,
  voiUpdatedEvent
) {
  debugger;
  // // We need a helper for this
  // if (
  //   sourceViewport.renderingEngineUID === targetViewport.renderingEngineUID &&
  //   sourceViewport.sceneUID === targetViewport.sceneUID &&
  //   sourceViewport.viewportUID === targetViewport.viewportUID
  // ) {
  //   return;
  // }

  // const { camera, previousCamera } = cameraUpdatedEvent.detail;

  // const tViewport = getRenderingEngine(targetViewport.renderingEngineUID)
  //   .getScene(targetViewport.sceneUID)
  //   .getViewport(targetViewport.viewportUID);

  // tViewport.setCamera(camera);

  // tViewport.render();
}
