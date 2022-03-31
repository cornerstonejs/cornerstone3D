import Events from '../enums/Events';
import { keyDown, keyUp } from './keyboardEventHandlers';

/**
 * Enable Key down and key up listeners
 *
 * @param element - The HTML element to attach the event listeners to.
 */
const enable = function (element: HTMLDivElement) {
  element.addEventListener(Events.KEY_DOWN, keyDown);
  element.addEventListener(Events.KEY_UP, keyUp);
};

/**
 * Disable Key down and key up listeners
 * @param element - The HTML element to attach the event listeners to.
 */
const disable = function (element: HTMLDivElement) {
  element.removeEventListener(Events.KEY_DOWN, keyDown);
  element.removeEventListener(Events.KEY_UP, keyUp);
};

const keyboardToolEventDispatcher = {
  enable,
  disable,
};

export default keyboardToolEventDispatcher;
