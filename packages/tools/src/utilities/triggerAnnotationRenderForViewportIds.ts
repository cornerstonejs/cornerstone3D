import type { Types } from '@cornerstonejs/core';
import triggerAnnotationRender from './triggerAnnotationRender';

export function triggerAnnotationRenderForViewportIds(
  renderingEngine: Types.IRenderingEngine,
  viewportIdsToRender: string[]
): void {
  if (!viewportIdsToRender.length) {
    return;
  }

  viewportIdsToRender.forEach((viewportId) => {
    const viewport = renderingEngine.getViewport(viewportId);
    if (!viewport) {
      // Happens on shutdown sometimes
      return;
    }
    const { element } = viewport;
    triggerAnnotationRender(element);
  });
}

export default triggerAnnotationRenderForViewportIds;
