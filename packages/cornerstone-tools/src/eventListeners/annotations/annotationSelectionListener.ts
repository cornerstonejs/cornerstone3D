import { getRenderingEngines } from '@precisionmetrics/cornerstone-render'
import { triggerAnnotationRenderForViewportUIDs } from '../../utilities'

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
  const deselectedAnnotation = evt.detail.removed

  if (!deselectedAnnotation.length) {
    return
  }

  const renderingEngines = getRenderingEngines()

  renderingEngines.forEach((renderingEngine) => {
    const viewports = renderingEngine.getViewports()
    const viewportUIDs = viewports.map((vp) => vp.uid)
    triggerAnnotationRenderForViewportUIDs(renderingEngine, viewportUIDs)
  })
}

export default annotationSelectionListener
