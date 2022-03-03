import { getRenderingEngine } from '@precisionmetrics/cornerstone-render'
import triggerAnnotationRenderForViewportUIDs from '../../util/triggerAnnotationRenderForViewportUIDs'

/**
 * This is a callback function that is called when a measurement is modified.
 * Since we are throttling the cachedStats calculation for annotation tools,
 * we need to trigger a final render for the toolData so that the measurement
 * textBox is updated.
 * Todo: This will trigger all the annotation tools to re-render, although DOM
 * will update those that have changed, but more efficient would be to only
 * update the changed toolData.
 * Todo: A better way is to extract the textBox render logic from the renderToolData
 * of all tools and just trigger a render for that (instead of the entire toolData, even if
 * no svg update happens since the attributes for handles are the same)
 */
function measurementModifiedListener(evt): void {
  const { viewportUID, renderingEngineUID } = evt.detail
  const renderingEngine = getRenderingEngine(renderingEngineUID)
  triggerAnnotationRenderForViewportUIDs(renderingEngine, [viewportUID])
}

export default measurementModifiedListener
