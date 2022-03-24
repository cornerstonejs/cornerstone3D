import type { Types } from '@cornerstonejs/core'
import triggerAnnotationRender from './triggerAnnotationRender'

export function triggerAnnotationRenderForViewportIds(
  renderingEngine: Types.IRenderingEngine,
  viewportUIDsToRender: string[]
): void {
  if (!viewportUIDsToRender.length) {
    return
  }

  viewportUIDsToRender.forEach((viewportId) => {
    const { element } = renderingEngine.getViewport(viewportId)
    triggerAnnotationRender(element)
  })
}

export default triggerAnnotationRenderForViewportIds
