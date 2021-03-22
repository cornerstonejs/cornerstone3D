import CornerstoneTools3DEvents from '../enums/CornerstoneTools3DEvents';
import {
  mouseClick,
  mouseDown,
  mouseDownActivate,
  mouseDoubleClick,
  mouseDrag,
  mouseMove,
  mouseUp,
  mouseWheel,
} from './mouseEventHandlers/index.js';

/**
 * @function enable These listeners are emitted in order, and can be cancelled/prevented from bubbling
 * by any previous event.
 *
 * @param {HTMLElement} element
 */
const enable = function (element: HTMLElement) {
  element.addEventListener(CornerstoneTools3DEvents.MOUSE_CLICK, mouseClick);
  element.addEventListener(CornerstoneTools3DEvents.MOUSE_DOWN, mouseDown);
  element.addEventListener(
    CornerstoneTools3DEvents.MOUSE_DOWN_ACTIVATE,
    mouseDownActivate
  );
  element.addEventListener(
    CornerstoneTools3DEvents.MOUSE_DOUBLE_CLICK,
    mouseDoubleClick
  );
  element.addEventListener(CornerstoneTools3DEvents.MOUSE_DRAG, mouseDrag);
  element.addEventListener(CornerstoneTools3DEvents.MOUSE_MOVE, mouseMove);
  element.addEventListener(CornerstoneTools3DEvents.MOUSE_UP, mouseUp);
  element.addEventListener(CornerstoneTools3DEvents.MOUSE_WHEEL, mouseWheel);
};

/**
 * @function disable Remove the MouseToolEventDispatcher handlers from the element.
 *
 * @param {HTMLElement} element
 */
const disable = function (element: HTMLElement) {
  element.removeEventListener(CornerstoneTools3DEvents.MOUSE_CLICK, mouseClick);
  element.removeEventListener(CornerstoneTools3DEvents.MOUSE_DOWN, mouseDown);
  element.removeEventListener(
    CornerstoneTools3DEvents.MOUSE_DOWN_ACTIVATE,
    mouseDownActivate
  );
  element.removeEventListener(
    CornerstoneTools3DEvents.MOUSE_DOUBLE_CLICK,
    mouseDoubleClick
  );
  element.removeEventListener(CornerstoneTools3DEvents.MOUSE_DRAG, mouseDrag);
  element.removeEventListener(CornerstoneTools3DEvents.MOUSE_MOVE, mouseMove);
  element.removeEventListener(CornerstoneTools3DEvents.MOUSE_UP, mouseUp);
  element.removeEventListener(CornerstoneTools3DEvents.MOUSE_WHEEL, mouseWheel);
};

const mouseToolEventDispatcher = {
  enable,
  disable,
};

export default mouseToolEventDispatcher;
