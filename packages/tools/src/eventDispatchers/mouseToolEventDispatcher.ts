import Events from '../enums/Events';
import { resetModifierKey } from '../eventListeners/keyboard/keyDownListener';

import {
  mouseClick,
  mouseDown,
  mouseDownActivate,
  mouseDoubleClick,
  mouseDrag,
  mouseMove,
  mouseUp,
  mouseWheel,
} from './mouseEventHandlers';

function resetModifierOnFocusChange() {
  resetModifierKey();
}

/**
 * Enable these listeners are emitted in order, and can be cancelled/prevented from bubbling
 * by any previous event.
 *
 * @param element - The element to add the event listeners to.
 */
const enable = function (element: HTMLDivElement): void {
  element.addEventListener(Events.MOUSE_CLICK, mouseClick as EventListener);
  element.addEventListener(Events.MOUSE_DOWN, mouseDown as EventListener);
  element.addEventListener(
    Events.MOUSE_DOWN_ACTIVATE,
    mouseDownActivate as EventListener
  );
  element.addEventListener(
    Events.MOUSE_DOUBLE_CLICK,
    mouseDoubleClick as EventListener
  );
  element.addEventListener(Events.MOUSE_DRAG, mouseDrag as EventListener);
  element.addEventListener(Events.MOUSE_MOVE, mouseMove as EventListener);
  element.addEventListener(Events.MOUSE_UP, mouseUp as EventListener);
  element.addEventListener(Events.MOUSE_WHEEL, mouseWheel as EventListener);
  window.addEventListener('focusin', resetModifierOnFocusChange);
};

/**
 * Disable and Remove the MouseToolEventDispatcher handlers from the element.
 *
 * @param element - HTMLDivElement
 */
const disable = function (element: HTMLDivElement) {
  element.removeEventListener(Events.MOUSE_CLICK, mouseClick as EventListener);
  element.removeEventListener(Events.MOUSE_DOWN, mouseDown as EventListener);
  element.removeEventListener(
    Events.MOUSE_DOWN_ACTIVATE,
    mouseDownActivate as EventListener
  );
  element.removeEventListener(
    Events.MOUSE_DOUBLE_CLICK,
    mouseDoubleClick as EventListener
  );
  element.removeEventListener(Events.MOUSE_DRAG, mouseDrag as EventListener);
  element.removeEventListener(Events.MOUSE_MOVE, mouseMove as EventListener);
  element.removeEventListener(Events.MOUSE_UP, mouseUp as EventListener);
  element.removeEventListener(Events.MOUSE_WHEEL, mouseWheel as EventListener);
  window.removeEventListener('focusin', resetModifierOnFocusChange);
};

const mouseToolEventDispatcher = {
  enable,
  disable,
};

export default mouseToolEventDispatcher;
