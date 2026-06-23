import type { Types } from '@cornerstonejs/core';
import {
  BaseVolumeViewport,
  getRenderingEngine,
  StackViewport,
  utilities,
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
  } else if (utilities.isGenericViewport(tViewport)) {
    // Direct Generic ("next") viewports expose presentation per display set
    // rather than setProperties. Map the source change's volumeId to THIS
    // viewport's binding so a fusion overlay (e.g. PT) update lands on the PT
    // binding and not the default source (CT) - the next analogue of the legacy
    // `setProperties(props, volumeId)` fusion path. Without this the PT colormap/
    // VOI sync colors the CT background. Fall back to the default binding when the
    // viewport has no matching binding (single-volume viewports).
    const genericViewport = tViewport as typeof tViewport & {
      findDataIdByVolumeId?: (volumeId: string) => string | undefined;
      setDisplaySetPresentation: (
        dataIdOrProps: string | typeof tProperties,
        props?: typeof tProperties
      ) => void;
    };
    const dataId = volumeId
      ? genericViewport.findDataIdByVolumeId?.(volumeId)
      : undefined;

    if (dataId) {
      genericViewport.setDisplaySetPresentation(dataId, tProperties);
    } else if (!volumeId) {
      // No source volume id (e.g. a stack VOI change) - apply to the default
      // binding.
      genericViewport.setDisplaySetPresentation(tProperties);
    }
    // else: the source change names a volume this viewport does not have bound
    // (e.g. a fusion-overlay colormap sync that arrives before the overlay is
    // mounted here). Skip rather than fall back to the default binding, which
    // would wrongly color the source (CT) actor. The overlay receives its own
    // colormap at mount, so no update is lost.
  } else {
    throw new Error('Viewport type not supported.');
  }

  tViewport.render();
}
