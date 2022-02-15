import { getRenderingEngines } from '@precisionmetrics/cornerstone-render'
import { triggerAnnotationRenderForViewportUIDs } from '../../util'

/**
 * When a measurement is diselected, trigger an annotation render for all viewports.
 * The reason for this is that, drawing a measurement in a different viewport
 * should diselect all other measurements in other viewports. In order to achieve
 * this, we need to trigger an annotation render for all viewports.
 * Todo: Although this is inefficient, but since annotations are only rendered if necessary,
 * it's probably not going to have a noticeable impact on performance.
 * @param evt - The event object.
 */
function measurementSelectionListener(evt): void {
  const diselectedToolData = evt.detail.removed

  if (!diselectedToolData.length) {
    return
  }

  const renderingEngines = getRenderingEngines()

  renderingEngines.forEach((renderingEngine) => {
    const viewports = renderingEngine.getViewports()
    const viewportUIDs = viewports.map((vp) => vp.uid)
    triggerAnnotationRenderForViewportUIDs(renderingEngine, viewportUIDs)
  })
}

export default measurementSelectionListener
