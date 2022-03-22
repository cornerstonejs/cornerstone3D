import { RenderingEngine } from '@cornerstonejs/core'
import triggerAnnotationRender from './triggerAnnotationRender'

export function triggerAnnotationRenderForViewportUIDs(
  renderingEngine: RenderingEngine,
  viewportUIDsToRender: string[]
): void {
  if (!viewportUIDsToRender.length) {
    return
  }

  viewportUIDsToRender.forEach((viewportUID) => {
    const { element } = renderingEngine.getViewport(viewportUID)
    triggerAnnotationRender(element)
  })
}

export default triggerAnnotationRenderForViewportUIDs
