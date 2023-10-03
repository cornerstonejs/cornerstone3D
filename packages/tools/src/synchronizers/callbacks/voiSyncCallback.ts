import {
  BaseVolumeViewport,
  getRenderingEngine,
  StackViewport,
  Types,
} from '@cornerstonejs/core';

/**
 * Synchronizer callback to synchronize the voi of volumeActors of identical volumes
 * in different viewports.
 *
 * @param synchronizerInstance - The Instance of the Synchronizer
 * @param sourceViewport - The list of IDs defining the source viewport.
 * @param targetViewport - The list of IDs defining the target viewport.
 * @param voiModifiedEvent - The VOI_MODIFIED event.
 * @param options - Options for the synchronizer.
 */
export default function voiSyncCallback(
  synchronizerInstance,
  sourceViewport: Types.IViewportId,
  targetViewport: Types.IViewportId,
  voiModifiedEvent: Types.EventTypes.VoiModifiedEvent,
  options?: any
): void {
  const eventDetail = voiModifiedEvent.detail;
  const { volumeId, range, invertStateChanged, invert } = eventDetail;

  const renderingEngine = getRenderingEngine(targetViewport.renderingEngineId);
  if (!renderingEngine) {
    throw new Error(
      `Rendering Engine does not exist: ${targetViewport.renderingEngineId}`
    );
  }

  const tViewport = renderingEngine.getViewport(targetViewport.viewportId);
  const tProperties:
    | Types.VolumeViewportProperties
    | Types.StackViewportProperties = {
    voiRange: range,
  };

  if (options?.syncInvertState && invertStateChanged) {
    tProperties.invert = invert;
  }

  if (tViewport instanceof BaseVolumeViewport) {
    tViewport.setProperties(tProperties, volumeId);
  } else if (tViewport instanceof StackViewport) {
    tViewport.setProperties(tProperties);
  } else {
    throw new Error('Viewport type not supported.');
  }

  tViewport.render();
}
