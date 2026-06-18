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
  if (options?.syncColormap && colormap?.name) {
    // Only synchronize the colormap identity (its name). Opacity and threshold are per-volume
    // properties already applied from the hanging protocol; re-propagating them here re-applies a
    // *scalar* opacity to the target — getColormap falls back to getMaxOpacity, and setThreshold
    // rebuilds the opacity function via getMaxOpacity — which collapses a fusion {value,opacity}[]
    // array to a single value. That turns the transparent (value 0 -> opacity 0) background opaque
    // on the synced viewports (OHIF #2633: TMTV fusion background color inconsistency).
    tProperties.colormap = { name: colormap.name };
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
