import { getRenderingEngine } from '../../../index';
import IViewportUID from '../../store/IViewportUID';

/**
 * @function cameraSyncCallback - Synchronizer callback to synchronize the voi of volumeActors of identical volumes
 * in different scenes.
 *
 * @param {object} synchronizerInstance The Instance of the Synchronizer
 * @param {IViewportUID} sourceViewport The list of UIDs defining the source viewport.
 * @param {IViewportUID} targetViewport The list of UIDs defining the target viewport.
 * @param {CustomEvent} voiModifiedEvent The VOI_MODIFIED event.
 */
export default function voiSyncCallback(
  synchronizerInstance,
  sourceViewport: IViewportUID,
  targetViewport: IViewportUID,
  voiModifiedEvent: CustomEvent
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
