import type { Types } from '@cornerstonejs/core';
import {
  getRenderingEngine,
  viewportHasPan,
  viewportHasZoom,
  viewportProjection,
} from '@cornerstonejs/core';
import type { Synchronizer } from '../../store';

type ZoomPanProjectionFraming = {
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
 * Synchronizes zoom and pan through the viewport projection service when both
 * viewports expose projection adapters. A source that the projection service
 * knows and that has no zoom and no pan, as a 3D viewport that shows nothing,
 * has nothing to give: the target stays, and its zoom and pan members are
 * not asked.
 *
 * @returns False when the projection service does not do the
 *   synchronization, so the zoom and pan members of the viewports do it.
 */
function syncProjectionZoomPan(
  sourceViewport: unknown,
  targetViewport: unknown,
  options: { syncPan?: boolean; syncZoom?: boolean } | undefined
): boolean {
  const sourceFraming = viewportProjection.getFraming<ZoomPanProjectionFraming>(
    sourceViewport,
    {
      selector: zoomPanProjectionSelector,
    }
  );

  if (!sourceFraming) {
    return false;
  }

  if (typeof sourceFraming.zoom !== 'number' && !sourceFraming.pan) {
    return true;
  }

  if (!viewportHasViewStateSetter(targetViewport)) {
    return false;
  }

  const framingPatch: ZoomPanProjectionFraming = {};

  if (options?.syncZoom !== false && typeof sourceFraming.zoom === 'number') {
    framingPatch.zoom = sourceFraming.zoom;
  }

  if (options?.syncPan !== false && sourceFraming.pan) {
    framingPatch.pan = sourceFraming.pan;
  }

  if (framingPatch.zoom === undefined && framingPatch.pan === undefined) {
    return false;
  }

  const nextViewState = viewportProjection.withFraming<
    unknown,
    ZoomPanProjectionFraming
  >(targetViewport, framingPatch);

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
 *
 * Each viewport is read from its own rendering engine, and a disabled source
 * or target does nothing.

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

  const options = synchronizerInstance.getOptions(
    targetViewport.viewportId,
    targetViewport.renderingEngineId
  );

  const tViewport = renderingEngine.getViewport(targetViewport.viewportId);
  const sViewport = getRenderingEngine(
    sourceViewport.renderingEngineId
  )?.getViewport(sourceViewport.viewportId);

  if (!sViewport || !tViewport) {
    return;
  }

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
