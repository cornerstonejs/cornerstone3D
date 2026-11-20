import type { Types } from '@cornerstonejs/core';
import { getRenderingEngine } from '@cornerstonejs/core';
import {
  applyViewportPresentation,
  getViewportPresentation,
} from '../../utilities/viewportPresentation';

/**
 * The fields of a presentation that a selector names, or the whole
 * presentation without a selector. The 3D family gives every field whatever
 * the selector, its camera too, and a camera in a patch replaces the camera
 * of the target.
 */
function selectedFieldsOf(
  presentation: unknown,
  selector?: Types.ViewPresentationSelector
): unknown {
  if (!selector || !presentation || typeof presentation !== 'object') {
    return presentation;
  }

  return Object.fromEntries(
    Object.entries(presentation).filter(
      ([key]) => selector[key as keyof Types.ViewPresentationSelector]
    )
  );
}

/**
 * Synchronizer callback to synchronize the camera. Synchronization
 *
 * targetViewport.options.syncZoom set to false to not sync the zoom
 * targetViewport.options.syncPan set to false to not sync the pan
 *
 * Each viewport is read from its own rendering engine.

 * @param synchronizerInstance - The Instance of the Synchronizer
 * @param sourceViewport - The list of IDs defining the source viewport.
 * @param targetViewport - The list of IDs defining the target viewport, different
 *   from sourceViewport
 * @param options - The options of the synchronizer: `viewPresentation` is the
 *   selector of the presentation to copy, all of it when not given.
 */
export default function presentationViewSyncCallback(
  _synchronizerInstance,
  sourceViewport: Types.IViewportId,
  targetViewport: Types.IViewportId,
  _sourceEvent,
  options?: { viewPresentation?: Types.ViewPresentationSelector }
): void {
  const renderingEngine = getRenderingEngine(targetViewport.renderingEngineId);
  if (!renderingEngine) {
    throw new Error(
      `No RenderingEngine for Id: ${targetViewport.renderingEngineId}`
    );
  }

  const tViewport = renderingEngine.getViewport(targetViewport.viewportId);
  const sViewport = getRenderingEngine(
    sourceViewport.renderingEngineId
  )?.getViewport(sourceViewport.viewportId);

  const selector = options?.viewPresentation;
  const presentationView = selectedFieldsOf(
    getViewportPresentation(sViewport, selector),
    selector
  );

  if (!applyViewportPresentation(tViewport, presentationView)) {
    return;
  }

  tViewport.render();
}
