import type { Types } from '@cornerstonejs/core';
import triggerAnnotationRender from './triggerAnnotationRender.js';

export function triggerAnnotationRenderForViewportIds(
  renderingEngine: Types.IRenderingEngine,
  viewportIdsToRender: string[]
): void {
  if (!viewportIdsToRender.length || !renderingEngine) {
    return;
  }

  viewportIdsToRender.forEach((viewportId) => {
    const viewport = renderingEngine.getViewport(viewportId);
    if (!viewport) {
      console.warn(`Viewport not available for ${viewportId}`);
      return;
    }
    const { element } = viewport;
    triggerAnnotationRender(element);
  });
}

export default triggerAnnotationRenderForViewportIds;
