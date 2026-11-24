import type { Types } from '@cornerstonejs/core';
import { getRenderingEngine } from '@cornerstonejs/core';
import {
  applyViewportFraming,
  getViewportFraming,
} from '../../utilities/viewportFraming';

/**
 * The fields of a framing that a selector names, or the whole
 * framing without a selector. The 3D family gives every field whatever
 * the selector, its camera too, and a camera in a patch replaces the camera
 * of the target.
 */
function selectedFieldsOf(
  framing: unknown,
  selector?: Types.ViewFramingSelector
): unknown {
  if (!selector || !framing || typeof framing !== 'object') {
    return framing;
  }

  return Object.fromEntries(
    Object.entries(framing).filter(
      ([key]) => selector[key as keyof Types.ViewFramingSelector]
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
 * @param options - The options of the synchronizer: `viewFraming` is the
 *   selector of the framing to copy, all of it when not given.
 */
export default function viewFramingSyncCallback(
  _synchronizerInstance,
  sourceViewport: Types.IViewportId,
  targetViewport: Types.IViewportId,
  _sourceEvent,
  options?: { viewFraming?: Types.ViewFramingSelector }
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

  const selector = options?.viewFraming;
  const viewFraming = selectedFieldsOf(
    getViewportFraming(sViewport, selector),
    selector
  );

  if (!applyViewportFraming(tViewport, viewFraming)) {
    return;
  }

  tViewport.render();
}
