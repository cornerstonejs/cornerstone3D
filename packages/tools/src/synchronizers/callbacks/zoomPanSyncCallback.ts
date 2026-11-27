import type { Types } from '@cornerstonejs/core';
import {
  getRenderingEngine,
  viewportHasPan,
  viewportHasZoom,
  viewportProjection,
} from '@cornerstonejs/core';
import type { Synchronizer } from '../../store';
import {
  changesCamera,
  getGroupMember,
  setInStep,
  viewportKey,
} from './synchronizerGroup';

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
 * Gives one viewport the zoom and the pan of another, through the viewport
 * projection service, or else through their zoom and pan members, and
 * renders it. `options` are the options of the viewport that takes them:
 * `syncZoom` or `syncPan` false leaves that one. The members set the zoom
 * first, as the pan is relative to the zoom.
 */
function copyZoomPan(
  from: Types.IViewport,
  to: Types.IViewport,
  options: { syncPan?: boolean; syncZoom?: boolean } | undefined
): void {
  if (syncProjectionZoomPan(from, to, options)) {
    to.render();
    return;
  }

  if (
    options?.syncZoom !== false &&
    viewportHasZoom(from) &&
    viewportHasZoom(to)
  ) {
    to.setZoom(from.getZoom());
  }
  if (
    options?.syncPan !== false &&
    viewportHasPan(from) &&
    viewportHasPan(to)
  ) {
    to.setPan(from.getPan());
  }

  to.render();
}

/** The viewport of the ids of a synchronizer member, when it is enabled. */
function getViewportOf(id: Types.IViewportId): Types.IViewport | undefined {
  return getRenderingEngine(id.renderingEngineId)?.getViewport(id.viewportId);
}

/** The ids and the viewport of a member, when it shows data. */
function getMemberShowingData(
  id: Types.IViewportId
): { id: Types.IViewportId; viewport: Types.IViewport } | undefined {
  const viewport = getViewportOf(id);

  return viewport?.getDisplaySets?.().length ? { id, viewport } : undefined;
}

/**
 * Synchronizer callback to synchronize the camera. Synchronization
 *
 * targetViewport.options.syncZoom set to false to not sync the zoom
 * targetViewport.options.syncPan set to false to not sync the pan
 *
 * Each viewport is read from its own rendering engine, and a disabled source
 * or target does nothing.
 *
 * A camera event that changed no camera (the mount of the source, which
 * fires the camera that it opens with, or a resize, which keeps the camera)
 * is not a change of the group, as the camera position synchronizer reads
 * it: it writes no other viewport, and the source takes the zoom and the pan
 * of the group from the first other viewport of the group in step with it
 * (`getGroupMember`). With no such viewport the source keeps its own. A pane
 * that joins a group at its mount so takes the zoom and the pan of the
 * group; 5.x and the 6.0 betas gave the group the fit of the joining pane.

 * @param synchronizerInstance - The Instance of the Synchronizer
 * @param sourceViewport - The list of IDs defining the source viewport.
 * @param targetViewport - The list of IDs defining the target viewport, different
 *   from sourceViewport
 * @param cameraModifiedEvent - The CAMERA_MODIFIED event.
 */
export default function zoomPanSyncCallback(
  synchronizerInstance: Synchronizer,
  sourceViewport: Types.IViewportId,
  targetViewport: Types.IViewportId,
  cameraModifiedEvent?: CustomEvent
): void {
  const renderingEngine = getRenderingEngine(targetViewport.renderingEngineId);
  if (!renderingEngine) {
    throw new Error(
      `No RenderingEngine for Id: ${targetViewport.renderingEngineId}`
    );
  }

  const tViewport = renderingEngine.getViewport(targetViewport.viewportId);
  const sViewport = getViewportOf(sourceViewport);

  if (!sViewport || !tViewport) {
    return;
  }

  if (!changesCamera(cameraModifiedEvent?.detail)) {
    const group = getGroupMember(
      synchronizerInstance,
      sourceViewport,
      cameraModifiedEvent,
      getMemberShowingData
    );

    if (group && viewportKey(group.id) === viewportKey(targetViewport)) {
      copyZoomPan(
        group.viewport,
        sViewport,
        synchronizerInstance.getOptions(
          sourceViewport.viewportId,
          sourceViewport.renderingEngineId
        )
      );
      setInStep(synchronizerInstance, group.id);
      setInStep(synchronizerInstance, sourceViewport);
    }

    return;
  }

  copyZoomPan(
    sViewport,
    tViewport,
    synchronizerInstance.getOptions(
      targetViewport.viewportId,
      targetViewport.renderingEngineId
    )
  );
  setInStep(synchronizerInstance, sourceViewport);
  setInStep(synchronizerInstance, targetViewport);
}
