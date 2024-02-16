import { getRenderingEngine, Types } from '@cornerstonejs/core';
import { Synchronizer } from '../../store';
import { PresentationViewSynchronizerOptions } from '../synchronizers/createPresentationViewSynchronizer';

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
export default function presentationViewSyncCallback(
  _synchronizerInstance,
  sourceViewport: Types.IViewportId,
  targetViewport: Types.IViewportId,
  _sourceEvent,
  options?: PresentationViewSynchronizerOptions
): void {
  const renderingEngine = getRenderingEngine(targetViewport.renderingEngineId);
  if (!renderingEngine) {
    throw new Error(
      `No RenderingEngine for Id: ${targetViewport.renderingEngineId}`
    );
  }

  const tViewport = renderingEngine.getViewport(targetViewport.viewportId);
  const sViewport = renderingEngine.getViewport(sourceViewport.viewportId);

  const presentationView = sViewport.getViewReference({ extended: true });
  const { FrameOfReferenceUID } = presentationView;
  const applyView: Types.ViewReference = {
    FrameOfReferenceUID,
  };
  if (options.applySlabThickness) {
    applyView.slabThickness = presentationView.slabThickness;
  }
  if (options.applyDisplayArea) {
    applyView.displayArea = presentationView.displayArea;
  }
  if (options.applyRotation) {
    applyView.rotation = presentationView.rotation;
  }

  tViewport.setViewReference(applyView);

  tViewport.render();
}
