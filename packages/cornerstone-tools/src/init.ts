import {
  eventTarget,
  EVENTS as RENDERING_EVENTS,
} from '@ohif/cornerstone-render'
import { getDefaultToolStateManager } from './stateManagement/toolState'
import { addEnabledElement, removeEnabledElement } from './store'
import { resetCornerstoneToolsState } from './store/state'
import { setColorLUT } from './store/SegmentationModule'

let csToolsInitialized = false

export function init(defaultConfiguration = {}) {
  if (csToolsInitialized) {
    return
  }

  _addCornerstoneEventListeners()
  // Creating the default color LUT
  setColorLUT(0)
  csToolsInitialized = true
}

export function destroy() {
  _removeCornerstoneEventListeners()

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

export default init
