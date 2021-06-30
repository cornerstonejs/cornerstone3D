// // State
import { state } from '../../store'
import { ToolModes } from '../../enums'

// // Util
import getToolsWithDataForElement from '../../store/getToolsWithDataForElement'
import getToolsWithModesForMouseEvent from '../shared/getToolsWithModesForMouseEvent'
import triggerAnnotationRender from '../../util/triggerAnnotationRender'

const { Active, Passive } = ToolModes

/**
 * @function mouseMove - On mouse move when not dragging, fire tools `mouseMoveCallback`s.
 * This is mostly used to update the [un]hover state
 * of a tool.
 *
 * @param {Event} evt The normalized mouseDown event.
 */
export default function mouseMove(evt) {
  if (state.isToolLocked || state.isMultiPartToolActive) {
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
