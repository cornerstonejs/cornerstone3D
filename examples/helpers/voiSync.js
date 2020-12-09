import { getRenderingEngine } from './../../src/index';

export default function voiSync(
  synchronizerInstance,
  sourceViewport,
  targetViewport,
  voiModifiedEvent
) {
  const eventData = voiModifiedEvent.detail;
  let { volumeUID, sceneUID, range } = eventData;

  const tScene = getRenderingEngine(targetViewport.renderingEngineUID).getScene(
    targetViewport.sceneUID
  );

  if (tScene.uid === sceneUID) {
    // Same scene, no need to update.
    return;
  }

  const tViewport = tScene.getViewport(targetViewport.viewportUID);

  const volumeActor = tScene.getVolumeActor(volumeUID);

  volumeActor
    .getProperty()
    .getRGBTransferFunction(0)
    .setRange(range.lower, range.upper);

  tViewport.render();
}
