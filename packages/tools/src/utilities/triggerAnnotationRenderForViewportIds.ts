import { getEnabledElementByViewportId } from '@cornerstonejs/core';
import triggerAnnotationRender from './triggerAnnotationRender';

export function triggerAnnotationRenderForViewportIds(
  viewportIdsToRender: string[]
): void {
  if (!viewportIdsToRender.length) {
    return;
  }

  viewportIdsToRender.forEach((viewportId) => {
    const enabledElement = getEnabledElementByViewportId(viewportId);
    if (!enabledElement) {
      console.warn(`Viewport not available for ${viewportId}`);
      return;
    }

    const { viewport } = enabledElement;

    if (!viewport) {
      console.warn(`Viewport not available for ${viewportId}`);
      return;
    }

    const element = viewport.element;
    triggerAnnotationRender(element);
  });
}

export default triggerAnnotationRenderForViewportIds;
