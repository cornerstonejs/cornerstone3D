import {
  eventTarget,
  EVENTS as RENDERING_EVENTS,
} from '@precisionmetrics/cornerstone-render'
import { getDefaultToolStateManager } from './stateManagement/toolState'
import { CornerstoneTools3DEvents } from './enums'
import { addEnabledElement, removeEnabledElement } from './store'
import { resetCornerstoneToolsState } from './store/state'
import { measurementSelectionListener } from './eventListeners'

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

  // Remove all tools
  resetCornerstoneToolsState()

  // remove all toolData
  const toolStateManager = getDefaultToolStateManager()
  toolStateManager.restoreToolState({})
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
 * the selection event.
 */
function _addCornerstoneToolsEventListeners() {
  // Clear any listeners that may already be set
  _removeCornerstoneToolsEventListeners()

  const selectionEvent = CornerstoneTools3DEvents.MEASUREMENT_SELECTION_CHANGE

  eventTarget.addEventListener(selectionEvent, measurementSelectionListener)
}

/**
 * Remove the event listener for the selection event
 */
function _removeCornerstoneToolsEventListeners() {
  const selectionEvent = CornerstoneTools3DEvents.MEASUREMENT_SELECTION_CHANGE

  eventTarget.removeEventListener(selectionEvent, measurementSelectionListener)
}

export default init
