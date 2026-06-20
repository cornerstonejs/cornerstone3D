import type { Types } from '@cornerstonejs/core';
import { getRenderingEngine, utilities } from '@cornerstonejs/core';
import type { Synchronizer } from '../../store';

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
  } else {
    (tViewport as Types.IStackViewport | Types.IVolumeViewport).setCamera(
      camera
    );
  }

  tViewport.render();
}
