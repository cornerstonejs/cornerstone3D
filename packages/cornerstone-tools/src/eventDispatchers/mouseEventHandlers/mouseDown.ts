// State
import {
  // getters,
  state,
} from '../../store'

import { ToolModes } from '../../enums'
import { ToolSpecificToolData } from '../../types'

import {
  selectToolData,
  deselectToolData,
  isToolDataSelected,
} from '../../stateManagement/toolDataSelection'

import { isToolDataLocked } from '../../stateManagement/toolDataLocking'

// // Util
import getToolsWithMoveableHandles from '../../store/getToolsWithMoveableHandles'
import getToolsWithDataForElement from '../../store/getToolsWithDataForElement'
import getMoveableAnnotationTools from '../../store/getMoveableAnnotationTools'
import getActiveToolForMouseEvent from '../shared/getActiveToolForMouseEvent'
import getToolsWithModesForMouseEvent from '../shared/getToolsWithModesForMouseEvent'

type Tool = {
  handleSelectedCallback: CallableFunction
  toolSelectedCallback: CallableFunction
}

type ToolAndToolData = {
  tool: Tool
  toolData: ToolSpecificToolData
  handle?: unknown
}

const { Active, Passive } = ToolModes

/**
 * @function mouseDown - When the mouse is depressed we check which entities can process these events in the following manner:
 *
 * - First we get the `activeTool` for the mouse button pressed.
 * - If the `activeTool` has a `preMouseDownCallback`, this is called. If the callback returns `true`,
 *   the event does not propagate further.
 * - Next we get all tools which are active or passive (`activeAndPassiveTools`), as toolData for these tools could
 *   possibly catch and handle these events. We then filter the `activeAndPassiveTools` using `getToolsWithDataForElement`, which filters tools with `toolState`
 *   for this frame of reference. Optionally a tool can employ a further filtering (via a
 *   `filterInteractableToolStateForElement` callback) for tools interactable within the current camera view
 *   (e.g. tools that only render when viewed from a certain direction).
 * - Next we check if any handles are interactable for each tool (`getToolsWithMoveableHandles`). If interactable
 *   handles are found, the first tool/handle found consumes the event and the event does not propagate further.
 * - Next we check any tools are interactable (e.g. moving an entire length annotation rather than one of its handles:
 *   `getMoveableAnnotationTools`). If interactable tools are found, the first tool found consumes the event and the
 *   event does not propagate further.
 * - Finally, if the `activeTool` has `postMouseDownCallback`, this is called.  If the callback returns `true`,
 *   the event does not propagate further.
 *
 * If the event is not consumed the event will bubble to the `mouseDownActivate` handler.
 *
 * @param {Event} evt The normalized mouseDown event.
 */
export default function mouseDown(evt) {
  // If a tool has locked the current state it is dealing with an interaction within its own eventloop.
  if (state.isInteractingWithTool) {
    return
  }

  const activeTool = getActiveToolForMouseEvent(evt)

  // Check for preMouseDownCallbacks
  if (activeTool && typeof activeTool.preMouseDownCallback === 'function') {
    const consumedEvent = activeTool.preMouseDownCallback(evt)

    if (consumedEvent) {
      // If the tool claims it consumed the event, prevent further checks.
      return
    }
  }

  // Find all tools that might respond to this mouse down
  const isPrimaryClick = evt.detail.event.buttons === 1
  const activeToolsWithEventBinding = getToolsWithModesForMouseEvent(
    evt,
    [Active],
    evt.detail.event.buttons
  )
  const passiveToolsIfEventWasPrimaryMouseButton = isPrimaryClick
    ? getToolsWithModesForMouseEvent(evt, [Passive])
    : undefined
  const applicableTools = [
    ...(activeToolsWithEventBinding || []),
    ...(passiveToolsIfEventWasPrimaryMouseButton || []),
  ]

  const eventData = evt.detail
  const { element } = eventData

  // Annotation tool specific
  const annotationTools = getToolsWithDataForElement(element, applicableTools)
  const canvasCoords = eventData.currentPoints.canvas
  const annotationToolsWithMoveableHandles = getToolsWithMoveableHandles(
    element,
    annotationTools,
    canvasCoords,
    'mouse'
  )

  // Preserve existing selections when shift key is pressed
  const isMultiSelect = !!evt.detail.event.shiftKey

  if (annotationToolsWithMoveableHandles.length > 0) {
    const { tool, toolData, handle } = selectSuitableAnnotationTool(
      annotationToolsWithMoveableHandles as ToolAndToolData[]
    )

    toggleToolDataSelection(toolData, isMultiSelect)
    tool.handleSelectedCallback(evt, toolData, handle, 'mouse')

    return
  }

  const moveableAnnotationTools = getMoveableAnnotationTools(
    element,
    annotationTools,
    canvasCoords,
    'mouse'
  )

  if (moveableAnnotationTools.length > 0) {
    const { tool, toolData } = selectSuitableAnnotationTool(
      moveableAnnotationTools as ToolAndToolData[]
    )

    toggleToolDataSelection(toolData, isMultiSelect)
    tool.toolSelectedCallback(evt, toolData, 'mouse')

    return
  }

  if (activeTool && typeof activeTool.postMouseDownCallback === 'function') {
    const consumedEvent = activeTool.postMouseDownCallback(evt)

    if (consumedEvent) {
      // If the tool claims it consumed the event, prevent further checks.
      return
    }
  }
}

function selectSuitableAnnotationTool(
  annotationTools: ToolAndToolData[]
): ToolAndToolData {
  return (
    (annotationTools.length > 1 &&
      annotationTools.find((item) => !isToolDataLocked(item.toolData))) ||
    annotationTools[0]
  )
}

function toggleToolDataSelection(
  toolData: ToolSpecificToolData,
  isMultiSelect = false
): void {
  if (isMultiSelect) {
    if (isToolDataSelected(toolData)) {
      deselectToolData(toolData)
    } else {
      selectToolData(toolData, true)
    }
  } else {
    selectToolData(toolData, false)
  }
}
