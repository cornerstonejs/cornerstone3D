import type { Types } from '@cornerstonejs/core';
import {
  getRenderingEngine,
  viewportHasPan,
  viewportHasZoom,
  viewportProjection,
} from '@cornerstonejs/core';
import type { Synchronizer } from '../../store';

type ZoomPanProjectionPresentation = {
  pan?: Types.Point2;
  zoom?: number;
};

const zoomPanProjectionSelector = {
  pan: true,
  zoom: true,
};

/**
 * Identifies viewports whose semantic state can be updated directly.
 */
function viewportHasViewStateSetter(
  viewport: unknown
): viewport is { setViewState(viewState: unknown): void } {
  return (
    Boolean(viewport) &&
    typeof viewport === 'object' &&
    'setViewState' in viewport &&
    typeof viewport.setViewState === 'function'
  );
}

/**
 * Synchronizes zoom and pan through the viewport projection registry when both
 * viewports expose projection adapters.
 */
function syncProjectionZoomPan(
  sourceViewport: unknown,
  targetViewport: unknown,
  options: { syncPan?: boolean; syncZoom?: boolean } | undefined
): boolean {
  if (!viewportHasViewStateSetter(targetViewport)) {
    return false;
  }

  const sourcePresentation =
    viewportProjection.getPresentation<ZoomPanProjectionPresentation>(
      sourceViewport,
      {
        selector: zoomPanProjectionSelector,
      }
    );

  if (!sourcePresentation) {
    return false;
  }

  const presentationPatch: ZoomPanProjectionPresentation = {};

  if (
    options?.syncZoom !== false &&
    typeof sourcePresentation.zoom === 'number'
  ) {
    presentationPatch.zoom = sourcePresentation.zoom;
  }

  if (options?.syncPan !== false && sourcePresentation.pan) {
    presentationPatch.pan = sourcePresentation.pan;
  }

  if (
    presentationPatch.zoom === undefined &&
    presentationPatch.pan === undefined
  ) {
    return false;
  }

  const nextViewState = viewportProjection.withPresentation<
    unknown,
    ZoomPanProjectionPresentation
  >(targetViewport, presentationPatch);

  if (!nextViewState) {
    return false;
  }

  targetViewport.setViewState(nextViewState);

  return true;
}

/**
 * Synchronizer callback to synchronize the camera. Synchronization
 *
 * targetViewport.options.syncZoom set to false to not sync the zoom
 * targetViewport.options.syncPan set to false to not sync the pan

 * @param synchronizerInstance - The Instance of the Synchronizer
 * @param sourceViewport - The list of IDs defining the source viewport.
 * @param targetViewport - The list of IDs defining the target viewport, different
 *   from sourceViewport
 */
export default function zoomPanSyncCallback(
  synchronizerInstance: Synchronizer,
  sourceViewport: Types.IViewportId,
  targetViewport: Types.IViewportId
): void {
  const renderingEngine = getRenderingEngine(targetViewport.renderingEngineId);
  if (!renderingEngine) {
    throw new Error(
      `No RenderingEngine for Id: ${targetViewport.renderingEngineId}`
    );
  }

  const options = synchronizerInstance.getOptions(targetViewport.viewportId);

  const tViewport = renderingEngine.getViewport(targetViewport.viewportId);
  const sViewport = renderingEngine.getViewport(sourceViewport.viewportId);
  const syncedByProjection = syncProjectionZoomPan(
    sViewport,
    tViewport,
    options
  );

  if (syncedByProjection) {
    tViewport.render();
    return;
  }

  if (
    options?.syncZoom !== false &&
    viewportHasZoom(sViewport) &&
    viewportHasZoom(tViewport)
  ) {
    const srcZoom = sViewport.getZoom();
    // Do the zoom first, as the pan is relative to the zoom level
    tViewport.setZoom(srcZoom);
  }
  if (
    options?.syncPan !== false &&
    viewportHasPan(sViewport) &&
    viewportHasPan(tViewport)
  ) {
    const srcPan = sViewport.getPan();
    tViewport.setPan(srcPan);
  }

  tViewport.render();
}
