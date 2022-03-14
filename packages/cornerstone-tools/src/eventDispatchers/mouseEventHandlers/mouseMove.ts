// // State
import { state } from '../../store'
import { ToolModes } from '../../enums'

// // Util
import getToolsWithDataForElement from '../../store/getToolsWithDataForElement'
import getToolsWithModesForMouseEvent from '../shared/getToolsWithModesForMouseEvent'
import triggerAnnotationRender from '../../util/triggerAnnotationRender'
import { MouseMoveEventType } from '../../types/EventTypes'

const { Active, Passive } = ToolModes

/**
 * mouseMove - On mouse move when not dragging, fire tools `mouseMoveCallback`s.
 * This is mostly used to update the [un]hover state
 * of a tool.
 *
 * @param evt - The normalized mouseDown event.
 */
export default function mouseMove(evt: MouseMoveEventType) {
  // Tool interactions when mouse moved are handled inside each tool.
  // This function is mostly used to update the [un]hover state
  if (state.isInteractingWithTool || state.isMultiPartToolActive) {
    return
  }

  const activeAndPassiveTools = getToolsWithModesForMouseEvent(evt, [
    Active,
    Passive,
  ])

  const eventData = evt.detail
  const { element } = eventData

  // Annotation tool specific
  const annotationTools = getToolsWithDataForElement(
    element,
    activeAndPassiveTools
  )

  const numAnnotationTools = annotationTools.length
  let annotationsNeedToBeRedrawn = false

  for (let t = 0; t < numAnnotationTools; t++) {
    const { tool, toolState } = annotationTools[t]
    if (typeof tool.mouseMoveCallback === 'function') {
      annotationsNeedToBeRedrawn =
        tool.mouseMoveCallback(evt, toolState) || annotationsNeedToBeRedrawn
    }
  }

  // Tool data activation status changed, redraw the annotations
  if (annotationsNeedToBeRedrawn === true) {
    triggerAnnotationRender(element)
  }
}
