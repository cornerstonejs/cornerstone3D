import Events from '../enums/Events';

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

/**
 * Enable these listeners are emitted in order, and can be cancelled/prevented from bubbling
 * by any previous event.
 *
 * @param element - The element to add the event listeners to.
 */
const enable = function (element: HTMLDivElement): void {
  element.addEventListener(Events.MOUSE_CLICK, mouseClick);
  element.addEventListener(Events.MOUSE_DOWN, mouseDown);
  element.addEventListener(Events.MOUSE_DOWN_ACTIVATE, mouseDownActivate);
  element.addEventListener(Events.MOUSE_DOUBLE_CLICK, mouseDoubleClick);
  element.addEventListener(Events.MOUSE_DRAG, mouseDrag);
  element.addEventListener(Events.MOUSE_MOVE, mouseMove);
  element.addEventListener(Events.MOUSE_UP, mouseUp);
  element.addEventListener(Events.MOUSE_WHEEL, mouseWheel);
};

/**
 * Disable and Remove the MouseToolEventDispatcher handlers from the element.
 *
 * @param element - HTMLDivElement
 */
const disable = function (element: HTMLDivElement) {
  element.removeEventListener(Events.MOUSE_CLICK, mouseClick);
  element.removeEventListener(Events.MOUSE_DOWN, mouseDown);
  element.removeEventListener(Events.MOUSE_DOWN_ACTIVATE, mouseDownActivate);
  element.removeEventListener(Events.MOUSE_DOUBLE_CLICK, mouseDoubleClick);
  element.removeEventListener(Events.MOUSE_DRAG, mouseDrag);
  element.removeEventListener(Events.MOUSE_MOVE, mouseMove);
  element.removeEventListener(Events.MOUSE_UP, mouseUp);
  element.removeEventListener(Events.MOUSE_WHEEL, mouseWheel);
};

const mouseToolEventDispatcher = {
  enable,
  disable,
};

export default mouseToolEventDispatcher;
