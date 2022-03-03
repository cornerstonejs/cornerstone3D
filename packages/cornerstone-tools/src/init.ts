import {
  eventTarget,
  EVENTS as RENDERING_EVENTS,
} from '@precisionmetrics/cornerstone-render'
import { getDefaultToolStateManager } from './stateManagement/annotation/toolState'
import { getDefaultSegmentationStateManager } from './stateManagement/segmentation/segmentationState'
import { CornerstoneTools3DEvents as TOOLS_EVENTS } from './enums'
import { addEnabledElement, removeEnabledElement } from './store'
import { resetCornerstoneToolsState } from './store/state'
import {
  measurementSelectionListener,
  segmentationDataModifiedEventListener,
  segmentationStateModifiedEventListener,
  measurementModifiedListener,
} from './eventListeners'

import ToolGroupManager from './store/ToolGroupManager'

let csToolsInitialized = false

export function init(defaultConfiguration = {}) {
  if (csToolsInitialized) {
    return
  }

  _addCornerstoneEventListeners()
  _addCornerstoneToolsEventListeners()

  csToolsInitialized = true
}

export function destroy() {
  _removeCornerstoneEventListeners()
  _removeCornerstoneToolsEventListeners()

  // Impportant: destroy ToolGroups first, in order for cleanup to work correctly for the
  // added tools.
  ToolGroupManager.destroy()

  // Remove all tools
  resetCornerstoneToolsState()

  // remove all toolData
  const toolStateManager = getDefaultToolStateManager()
  const segmentationStateManager = getDefaultSegmentationStateManager()

  toolStateManager.restoreToolState({})
  segmentationStateManager.resetState()
  csToolsInitialized = false
}

/**
 * Wires up event listeners for the Cornerstone#ElementDisabled and
 * Cornerstone#ElementEnabled events.
 *
 * @private
 * @method
 * @returns {void}
 */
function _addCornerstoneEventListeners() {
  // Clear any listeners that may already be set
  _removeCornerstoneEventListeners()

  const elementEnabledEvent = RENDERING_EVENTS.ELEMENT_ENABLED
  const elementDisabledEvent = RENDERING_EVENTS.ELEMENT_DISABLED

  eventTarget.addEventListener(elementEnabledEvent, addEnabledElement)
  eventTarget.addEventListener(elementDisabledEvent, removeEnabledElement)
}

/**
 * Removes event listeners for the Cornerstone#ElementDisabled and
 * Cornerstone#ElementEnabled events.
 *
 * @private
 * @method
 * @returns {void}
 */
function _removeCornerstoneEventListeners() {
  const elementEnabledEvent = RENDERING_EVENTS.ELEMENT_ENABLED
  const elementDisabledEvent = RENDERING_EVENTS.ELEMENT_DISABLED

  eventTarget.removeEventListener(elementEnabledEvent, addEnabledElement)
  eventTarget.removeEventListener(elementDisabledEvent, removeEnabledElement)
}

/**
 * It adds an event listener to the event target (the cornerstoneTools object) for
 * the measurement selected and measurement modified events.
 */
function _addCornerstoneToolsEventListeners() {
  // Clear any listeners that may already be set
  _removeCornerstoneToolsEventListeners()

  const selectionEvent = TOOLS_EVENTS.MEASUREMENT_SELECTION_CHANGE
  const segmentationDataModified = TOOLS_EVENTS.SEGMENTATION_DATA_MODIFIED
  const segmentationStateModified = TOOLS_EVENTS.SEGMENTATION_STATE_MODIFIED
  const modifiedEvent = TOOLS_EVENTS.MEASUREMENT_MODIFIED

  eventTarget.addEventListener(selectionEvent, measurementSelectionListener)
  eventTarget.addEventListener(
    segmentationDataModified,
    segmentationDataModifiedEventListener
  )
  eventTarget.addEventListener(
    segmentationStateModified,
    segmentationStateModifiedEventListener
  )

  eventTarget.addEventListener(selectionEvent, measurementSelectionListener)
  eventTarget.addEventListener(modifiedEvent, measurementModifiedListener)
}

/**
 * Remove the event listener for the the measurement selected and measurement modified events.
 */
function _removeCornerstoneToolsEventListeners() {
  const selectionEvent = TOOLS_EVENTS.MEASUREMENT_SELECTION_CHANGE
  const modifiedEvent = TOOLS_EVENTS.MEASUREMENT_MODIFIED
  const segmentationDataModified = TOOLS_EVENTS.SEGMENTATION_DATA_MODIFIED
  const segmentationStateModified = TOOLS_EVENTS.SEGMENTATION_STATE_MODIFIED

  eventTarget.removeEventListener(selectionEvent, measurementSelectionListener)
  eventTarget.removeEventListener(
    segmentationDataModified,
    segmentationDataModifiedEventListener
  )
  eventTarget.removeEventListener(
    segmentationStateModified,
    segmentationStateModifiedEventListener
  )

  eventTarget.removeEventListener(selectionEvent, measurementSelectionListener)
  eventTarget.removeEventListener(modifiedEvent, measurementModifiedListener)
}

export default init
