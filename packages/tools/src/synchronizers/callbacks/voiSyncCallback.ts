import {
  getRenderingEngine,
  StackViewport,
  Types,
  VolumeViewport,
} from '@cornerstonejs/core';

/**
 * Synchronizer callback to synchronize the voi of volumeActors of identical volumes
 * in different viewports.
 *
 * @param synchronizerInstance - The Instance of the Synchronizer
 * @param sourceViewport - The list of IDs defining the source viewport.
 * @param targetViewport - The list of IDs defining the target viewport.
 * @param voiModifiedEvent - The VOI_MODIFIED event.
 */
export default function voiSyncCallback(
  synchronizerInstance,
  sourceViewport: Types.IViewportId,
  targetViewport: Types.IViewportId,
  voiModifiedEvent: Types.EventTypes.VoiModifiedEvent
): void {
  const eventDetail = voiModifiedEvent.detail;
  const { volumeId, range } = eventDetail;

  const renderingEngine = getRenderingEngine(targetViewport.renderingEngineId);
  if (!renderingEngine) {
    throw new Error(
      `Rendering Engine does not exist: ${targetViewport.renderingEngineId}`
    );
  }

  const tViewport = renderingEngine.getViewport(targetViewport.viewportId);

  if (tViewport instanceof VolumeViewport) {
    tViewport.setProperties(
      {
        voiRange: range,
      },
      volumeId
    );
  } else if (tViewport instanceof StackViewport) {
    tViewport.setProperties({
      voiRange: range,
    });
  } else {
    throw new Error('Viewport type not supported.');
  }

  tViewport.render();
}
