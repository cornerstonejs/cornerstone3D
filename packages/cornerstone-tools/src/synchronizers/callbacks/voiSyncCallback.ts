import {
  getRenderingEngine,
  StackViewport,
  Types,
  VolumeViewport,
} from '@precisionmetrics/cornerstone-render'

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
  sourceViewport: Types.IViewportUID,
  targetViewport: Types.IViewportUID,
  voiModifiedEvent: CustomEvent
): void {
  const eventData = voiModifiedEvent.detail
  const { volumeUID, sceneUID, range } = eventData

  const renderingEngine = getRenderingEngine(targetViewport.renderingEngineUID)
  if (!renderingEngine) {
    throw new Error(
      `Rendering Engine does not exist: ${targetViewport.renderingEngineUID}`
    )
  }

  const tScene = renderingEngine.getScene(targetViewport.sceneUID)

  if (tScene && tScene.uid === sceneUID) {
    // Same scene, no need to update since RGB transfer function gets updated.
    return
  }

  const tViewport = renderingEngine.getViewport(targetViewport.viewportUID)

  if (tViewport instanceof VolumeViewport) {
    const scene = renderingEngine.getScene(tViewport.sceneUID)
    const volumeActor = scene.getVolumeActor(volumeUID)

    // TODO: This may not be what we want. It is a fallback
    // for cases when we are syncing from a stack to a volume viewport
    //if (!volumeActor) {
    // TODO: this is a bit confusing that this returns something different
    // than getVolumeActor(). We should change getVolumeActor() I think
    //  volumeActor = scene.getVolumeActors()[0].volumeActor
    //}

    if (volumeActor) {
      volumeActor
        .getProperty()
        .getRGBTransferFunction(0)
        .setRange(range.lower, range.upper)
    }
  } else if (tViewport instanceof StackViewport) {
    tViewport.setProperties({
      voiRange: range,
    })
  } else {
    throw new Error('Viewport type not supported.')
  }

  tViewport.render()
}
