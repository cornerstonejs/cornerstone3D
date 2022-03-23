import type { Types } from '@cornerstonejs/core'
import triggerAnnotationRender from './triggerAnnotationRender'

export function triggerAnnotationRenderForViewportUIDs(
  renderingEngine: Types.IRenderingEngine,
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
