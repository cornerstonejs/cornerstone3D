// // State
import { state } from './../../store/index'
import { ToolModes } from './../../enums/index'
import { getEnabledElement } from '@vtk-viewport'

// // Util
import getToolsWithDataForElement from '../../store/getToolsWithDataForElement'
import getToolsWithModesForMouseEvent from '../shared/getToolsWithModesForMouseEvent'

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
  let imageNeedsUpdate = false

  for (let t = 0; t < numAnnotationTools; t++) {
    const { tool, toolState } = annotationTools[t]
    if (typeof tool.mouseMoveCallback === 'function') {
      imageNeedsUpdate =
        tool.mouseMoveCallback(evt, toolState) || imageNeedsUpdate
    }
  }

  // Tool data activation status changed, redraw the image
  if (imageNeedsUpdate === true) {
    const enabledElement = getEnabledElement(element)
    const { viewport } = enabledElement

    viewport.render()
  }
}
