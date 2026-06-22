import type { Types } from '@cornerstonejs/core';
import { getRenderingEngine, utilities } from '@cornerstonejs/core';
import type { Synchronizer } from '../../store';
import {
  applyViewportPresentation,
  getViewportPresentation,
} from '../../utilities/viewportPresentation';

// A ViewReference deliberately excludes zoom/pan (see IViewport ViewReference
// docs), so for Generic ("next") viewports we transport them separately to match
// the legacy setCamera(camera) path, which carried parallelScale (zoom) + the
// in-plane focal point (pan). Mirrors zoomPanSyncCallback's selector.
const ZOOM_PAN_SELECTOR: Types.ViewPresentationSelector = {
  pan: true,
  zoom: true,
};

/**
 * Synchronizer callback to synchronize the camera by updating all camera
 * values.  See also zoomPanSyncCallback
 *
 * @param synchronizerInstance - The Instance of the Synchronizer
 * @param sourceViewport - The list of IDs defining the source viewport.
 * @param targetViewport - The list of IDs defining the target viewport, never
 *   the same as sourceViewport.
 * @param cameraModifiedEvent - The CAMERA_MODIFIED event.
 */
export default function cameraSyncCallback(
  synchronizerInstance: Synchronizer,
  sourceViewport: Types.IViewportId,
  targetViewport: Types.IViewportId,
  cameraModifiedEvent: CustomEvent
): void {
  const { camera } = cameraModifiedEvent.detail;

  const renderingEngine = getRenderingEngine(targetViewport.renderingEngineId);
  if (!renderingEngine) {
    throw new Error(
      `No RenderingEngine for Id: ${targetViewport.renderingEngineId}`
    );
  }

  const tViewport = renderingEngine.getViewport(targetViewport.viewportId);

  if (utilities.isGenericViewport(tViewport)) {
    // Direct Generic ("next") viewports do not expose setCamera. Camera-position
    // synchronization across viewports is expressed natively by copying the
    // source viewport's spatial view reference onto the target. The CAMERA_MODIFIED
    // event detail only carries an ICamera (no ViewReference), so we read the
    // reference live from the source viewport rather than from the event snapshot;
    // any sync lag from the live read is inherent to the event not carrying one.
    const sViewport = renderingEngine.getViewport(sourceViewport.viewportId);
    tViewport.setViewReference(sViewport.getViewReference());

    // Slice/orientation come from the view reference above; copy zoom + pan
    // explicitly so they stay in lockstep like the legacy full-camera copy did.
    // applyViewportPresentation is a no-op for targets without a projection
    // adapter, so this is safe for any next-viewport family.
    const zoomPanPresentation = getViewportPresentation(
      sViewport,
      ZOOM_PAN_SELECTOR
    );
    applyViewportPresentation(tViewport, zoomPanPresentation);
  } else {
    (tViewport as Types.IStackViewport | Types.IVolumeViewport).setCamera(
      camera
    );
  }

  tViewport.render();
}
