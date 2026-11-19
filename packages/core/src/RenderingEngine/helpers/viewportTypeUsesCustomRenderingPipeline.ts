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
 * `IMAGE_RENDERED`, so the engine gets no detail and fires none for it.
 */
export function renderCustomPipelineViewport(
  viewport: EngineViewport
): EventTypes.ImageRenderedEventDetail | undefined {
  if (viewport.customRenderViewportToCanvas) {
    return viewport.customRenderViewportToCanvas() as EventTypes.ImageRenderedEventDetail;
  }

  viewport.render();

  return undefined;
}
