import CornerstoneTools3DEvents from '../enums/CornerstoneTools3DEvents'
import { keyDown, keyUp } from './keyboardEventHandlers'

/**
 * @function enable These listeners are emitted in order, and can be cancelled/prevented from bubbling
 * by any previous event.
 *
 * @param {HTMLElement} element
 */
const enable = function (element: HTMLElement) {
  element.addEventListener(CornerstoneTools3DEvents.KEY_DOWN, keyDown)
  element.addEventListener(CornerstoneTools3DEvents.KEY_UP, keyUp)
}

/**
 * @function disable Remove the keyboardToolEventDispatcher handlers from the element.
 *
 * @param {HTMLElement} element
 */
const disable = function (element: HTMLElement) {
  element.removeEventListener(CornerstoneTools3DEvents.KEY_DOWN, keyDown)
  element.removeEventListener(CornerstoneTools3DEvents.KEY_UP, keyUp)
}

const keyboardToolEventDispatcher = {
  enable,
  disable,
}

export default keyboardToolEventDispatcher
