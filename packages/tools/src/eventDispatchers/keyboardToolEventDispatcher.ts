import Events from '../enums/Events';
import { keyDown, keyUp } from './keyboardEventHandlers';

/**
 * Enable Key down and key up listeners
 *
 * @param element - The HTML element to attach the event listeners to.
 */
const enable = function (element: HTMLDivElement) {
  element.addEventListener(Events.KEY_DOWN, keyDown as EventListener);
  element.addEventListener(Events.KEY_UP, keyUp as EventListener);
};

/**
 * Disable Key down and key up listeners
 * @param element - The HTML element to attach the event listeners to.
 */
const disable = function (element: HTMLDivElement) {
  element.removeEventListener(Events.KEY_DOWN, keyDown as EventListener);
  element.removeEventListener(Events.KEY_UP, keyUp as EventListener);
};

const keyboardToolEventDispatcher = {
  enable,
  disable,
};

export default keyboardToolEventDispatcher;
