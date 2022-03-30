import { getRenderingEngines } from '@cornerstonejs/core';
import { triggerAnnotationRenderForViewportIds } from '../../utilities';

/**
 * When an annotation is deselected, trigger an annotation render for all viewports.
 * The reason for this is that, drawing an annotation in a different viewport
 * should deselect all other annotations in other viewports. In order to achieve
 * this, we need to trigger an annotation render for all viewports.
 * Todo: Although this is inefficient, but since annotations are only rendered if necessary,
 * it's probably not going to have a noticeable impact on performance.
 * @param evt - The event object.
 */
function annotationSelectionListener(evt): void {
  const deselectedAnnotation = evt.detail.removed;

  if (!deselectedAnnotation.length) {
    return;
  }

  const renderingEngines = getRenderingEngines();

  renderingEngines.forEach((renderingEngine) => {
    const viewports = renderingEngine.getViewports();
    const viewportIds = viewports.map((vp) => vp.id);
    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIds);
  });
}

export default annotationSelectionListener;
