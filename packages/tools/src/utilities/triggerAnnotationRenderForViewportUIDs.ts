import type { Types } from '@cornerstonejs/core'
import triggerAnnotationRender from './triggerAnnotationRender'

export function triggerAnnotationRenderForViewportIds(
  renderingEngine: Types.IRenderingEngine,
  viewportIDsToRender: string[]
): void {
  if (!viewportIDsToRender.length) {
    return
  }

  viewportIDsToRender.forEach((viewportId) => {
    const { element } = renderingEngine.getViewport(viewportId)
    triggerAnnotationRender(element)
  })
}

export default triggerAnnotationRenderForViewportIds
