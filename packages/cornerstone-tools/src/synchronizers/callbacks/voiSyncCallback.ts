import {
  getRenderingEngine,
  StackViewport,
  Types,
  VolumeViewport,
} from '@precisionmetrics/cornerstone-render'

/**
 * Synchronizer callback to synchronize the voi of volumeActors of identical volumes
 * in different viewports.
 *
 * @param synchronizerInstance - The Instance of the Synchronizer
 * @param sourceViewport - The list of UIDs defining the source viewport.
 * @param targetViewport - The list of UIDs defining the target viewport.
 * @param voiModifiedEvent - The VOI_MODIFIED event.
 */
export default function voiSyncCallback(
  synchronizerInstance,
  sourceViewport: Types.IViewportUID,
  targetViewport: Types.IViewportUID,
  voiModifiedEvent: Types.EventTypes.VoiModifiedEvent
): void {
  const eventDetail = voiModifiedEvent.detail
  const { volumeUID, range } = eventDetail

  const renderingEngine = getRenderingEngine(targetViewport.renderingEngineUID)
  if (!renderingEngine) {
    throw new Error(
      `Rendering Engine does not exist: ${targetViewport.renderingEngineUID}`
    )
  }

  const tViewport = renderingEngine.getViewport(targetViewport.viewportUID)

  if (tViewport instanceof VolumeViewport) {
    const actor = tViewport.getActor(volumeUID)

    if (actor) {
      actor.volumeActor
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
