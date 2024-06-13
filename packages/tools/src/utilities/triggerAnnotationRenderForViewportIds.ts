import { getEnabledElementByViewportId } from '@cornerstonejs/core';
import triggerAnnotationRender from './triggerAnnotationRender';

export function triggerAnnotationRenderForViewportIds(
  viewportIdsToRender: string[]
): void {
  if (!viewportIdsToRender.length) {
    return;
  }

  viewportIdsToRender.forEach((viewportId) => {
    const { viewport } = getEnabledElementByViewportId(viewportId);
    if (!viewport) {
      console.warn(`Viewport not available for ${viewportId}`);
      return;
    }
    const { element } = viewport;
    triggerAnnotationRender(element);
  });
}

export default triggerAnnotationRenderForViewportIds;
