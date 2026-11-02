import { getEnabledElementByViewportId } from '@cornerstonejs/core';
import triggerAnnotationRender from './triggerAnnotationRender';
import { utilities as cornerstoneUtilities } from '@cornerstonejs/core';

const cs3dLogger = cornerstoneUtilities.logger.toolsLog.getLogger(
  'utilities.triggerAnnotationRenderForViewportIds'
);

export function triggerAnnotationRenderForViewportIds(
  viewportIdsToRender: string[]
): void {
  if (!viewportIdsToRender.length) {
    return;
  }

  viewportIdsToRender.forEach((viewportId) => {
    const enabledElement = getEnabledElementByViewportId(viewportId);
    if (!enabledElement) {
      cs3dLogger.warn(`Viewport not available for ${viewportId}`);
      return;
    }

    const { viewport } = enabledElement;

    if (!viewport) {
      cs3dLogger.warn(`Viewport not available for ${viewportId}`);
      return;
    }

    const element = viewport.element;
    triggerAnnotationRender(element);
  });
}

export default triggerAnnotationRenderForViewportIds;
