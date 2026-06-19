import type { Types } from '@cornerstonejs/core';
import {
  BaseVolumeViewport,
  getRenderingEngine,
  StackViewport,
} from '@cornerstonejs/core';

/**
 * Synchronizer callback to synchronize the voi of volumeActors of identical volumes
 * in different viewports.
 *
 * @param synchronizerInstance - The Instance of the Synchronizer
 * @param sourceViewport - The list of IDs defining the source viewport.
 * @param targetViewport - The list of IDs defining the target viewport.
 * @param modifiedEvent - The COLORMAP_MODIFIED or VOI_MODIFIED event.
 * @param options - Options for the synchronizer.
 */
export default function voiSyncCallback(
  synchronizerInstance,
  sourceViewport: Types.IViewportId,
  targetViewport: Types.IViewportId,
  modifiedEvent: Types.EventTypes.VoiModifiedEvent,
  options?: { syncInvertState?: boolean; syncColormap?: boolean }
): void {
  const eventDetail = modifiedEvent.detail;
  const { volumeId, range, invertStateChanged, invert, colormap } = eventDetail;

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
  if (options?.syncColormap && colormap) {
    // The colormap carries the scalar overall opacity, the per-value opacity mapping, and the
    // threshold as separate fields, so the target re-derives its opacity function (overall *
    // mapping, with threshold cutoff) without collapsing the mapping to a single value. This keeps
    // both the initial fusion display and slider/threshold changes synchronized correctly.
    tProperties.colormap = colormap;
  }

  if (tViewport instanceof BaseVolumeViewport) {
    const isFusion = tViewport._actors && tViewport._actors.size > 1;
    if (isFusion) {
      tViewport.setProperties(tProperties, volumeId);
    } else {
      tViewport.setProperties(tProperties);
    }
  } else if (tViewport instanceof StackViewport) {
    tViewport.setProperties(tProperties);
  } else {
    throw new Error('Viewport type not supported.');
  }

  tViewport.render();
}
