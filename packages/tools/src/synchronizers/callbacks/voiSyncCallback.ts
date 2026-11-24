import type { Types } from '@cornerstonejs/core';
import { getRenderingEngine } from '@cornerstonejs/core';

/**
 * Whether a VOI_MODIFIED event gives the targets an invert to take. The
 * event of a next viewport carries the invert of its display set in
 * `invert`, in stack mode and in volume mode, and the targets take it when
 * it is set.
 */
function givesInvert(
  eventDetail: Types.EventTypes.VoiModifiedEventDetail
): boolean {
  return eventDetail.invert !== undefined;
}

/**
 * The display set of a next viewport that shows this volume, found through
 * its display sets and its view references, for a viewport without
 * `findDataIdByVolumeId` such as the 3D viewport.
 */
function getDisplaySetIdOfVolume(
  viewport: Types.IViewport & {
    getDisplaySets(): Array<{ displaySetId: string }>;
  },
  volumeId: string
): string | undefined {
  return viewport
    .getDisplaySets()
    .map(({ displaySetId }) => displaySetId)
    .find((displaySetId) =>
      viewport.isReferenceViewable({ dataId: displaySetId, volumeId })
    );
}

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
  const { volumeId, range, invert, colormap } = eventDetail;

  const renderingEngine = getRenderingEngine(targetViewport.renderingEngineId);
  if (!renderingEngine) {
    throw new Error(
      `Rendering Engine does not exist: ${targetViewport.renderingEngineId}`
    );
  }

  const tViewport = renderingEngine.getViewport(targetViewport.viewportId);
  const tProperties: {
    voiRange: Types.VOIRange;
    invert?: boolean;
    colormap?: Types.ColormapPublic;
  } = {
    voiRange: range,
  };

  if (options?.syncInvertState && givesInvert(eventDetail)) {
    tProperties.invert = invert;
  }
  if (options?.syncColormap && colormap) {
    // The colormap carries the scalar overall opacity, the per-value opacity mapping, and the
    // threshold as separate fields, so the target re-derives its opacity function (overall *
    // mapping, with threshold cutoff) without collapsing the mapping to a single value. This keeps
    // both the initial fusion display and slider/threshold changes synchronized correctly.
    tProperties.colormap = colormap;
  }

  // Viewports expose presentation per display set
  // rather than setProperties. Map the source change's volumeId to THIS
  // viewport's binding so a fusion overlay (e.g. PT) update lands on the PT
  // binding and not the default source (CT) - the next analogue of the legacy
  // `setProperties(props, volumeId)` fusion path. Without this the PT colormap/
  // VOI sync colors the CT background. Fall back to the default binding when the
  // viewport has no matching binding (single-volume viewports).
  const displaySetViewport = tViewport as typeof tViewport & {
    findDataIdByVolumeId?: (volumeId: string) => string | undefined;
    getDisplaySets(): Array<{ displaySetId: string }>;
    setDisplaySetPresentation: (
      dataIdOrProps: string | typeof tProperties,
      props?: typeof tProperties
    ) => void;
  };
  const dataId = !volumeId
    ? undefined
    : typeof displaySetViewport.findDataIdByVolumeId === 'function'
      ? displaySetViewport.findDataIdByVolumeId(volumeId)
      : getDisplaySetIdOfVolume(displaySetViewport, volumeId);

  if (dataId) {
    displaySetViewport.setDisplaySetPresentation(dataId, tProperties);
  } else if (!volumeId) {
    // No source volume id (e.g. a stack VOI change) - apply to the default
    // binding.
    displaySetViewport.setDisplaySetPresentation(tProperties);
  }
  // else: the source change names a volume this viewport does not have bound
  // (e.g. a fusion-overlay colormap sync that arrives before the overlay is
  // mounted here). Skip rather than fall back to the default binding, which
  // would wrongly color the source (CT) actor. The overlay receives its own
  // colormap at mount, so no update is lost.

  tViewport.render();
}
