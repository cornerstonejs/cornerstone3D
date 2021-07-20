import {
  eventTarget,
  EVENTS as RENDERING_EVENTS,
} from '@ohif/cornerstone-render'
import { addEnabledElement, removeEnabledElement } from './store'
import { state } from './store/state'

export function init (defaultConfiguration = {}) {
  _addCornerstoneEventListeners()
}

export function destroy () {
  _removeCornerstoneEventListeners()

  // Remove all tools
  for (const prop of Object.getOwnPropertyNames(state)) {
    delete state[prop];
  }
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
