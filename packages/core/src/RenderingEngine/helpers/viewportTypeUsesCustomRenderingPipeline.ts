import type EngineViewport from '../EngineViewport';
import type * as EventTypes from '../../types/EventTypes';
import {
  getViewportClassForInput,
  isRegisteredViewportType,
} from './viewportTypeToViewportClass';

export default function viewportTypeUsesCustomRenderingPipeline(
  viewportType: string
) {
  if (!isRegisteredViewportType(viewportType)) {
    return false;
  }

  return Boolean(
    getViewportClassForInput({ type: viewportType as never })
      .useCustomRenderingPipeline
  );
}

export function viewportUsesCustomRenderingPipeline(
  viewport: EngineViewport
): boolean {
  return viewport.getUseCustomRenderingPipeline();
}

/**
 * Draws a viewport that draws itself, for a frame of the rendering engine,
 * and gives the detail of the `IMAGE_RENDERED` that the engine fires. A
 * viewport with no `customRenderViewportToCanvas`, as a planar viewport on a
 * device without WebGL, draws in its `render()` and fires its own
 * `IMAGE_RENDERED`, so the engine gets no detail and fires none for it. It
 * draws in a microtask, after the engine ends the frame, as the engine fires
 * the events of the other viewports after it: a listener that asks the
 * engine for a render then gets the next frame.
 */
export function renderCustomPipelineViewport(
  viewport: EngineViewport
): EventTypes.ImageRenderedEventDetail | undefined {
  if (viewport.customRenderViewportToCanvas) {
    return viewport.customRenderViewportToCanvas() as EventTypes.ImageRenderedEventDetail;
  }

  queueMicrotask(() => viewport.render());

  return undefined;
}
