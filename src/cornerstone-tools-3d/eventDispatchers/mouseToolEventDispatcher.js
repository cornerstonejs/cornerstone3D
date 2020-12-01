import VtkjsToolsEvents from '../enums/VtkjsToolsEvents.ts';
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
 * These listeners are emitted in order, and can be cancelled/prevented from bubbling
 * by any previous event.
 *
 * - mouseMove: used to update the [un]hover state of a tool (highlighting)
 * - mouseDown: check to see if we are close to an existing annotation, grab it
 * - mouseDownActivate: createNewMeasurement (usually)
 * - mouseDrag: update measurement or apply strategy (wwwc)
 * - mouseDoubleClick: usually a one-time apply specialty action
 * - onImageRendered: redraw visible tool data
 *
 * @private
 * @param {*} element
 * @returns {undefined}
 */
const enable = function(element) {
  element.addEventListener(VtkjsToolsEvents.MOUSE_CLICK, mouseClick);
  element.addEventListener(VtkjsToolsEvents.MOUSE_DOWN, mouseDown);
  element.addEventListener(
    VtkjsToolsEvents.MOUSE_DOWN_ACTIVATE,
    mouseDownActivate
  );
  element.addEventListener(
    VtkjsToolsEvents.MOUSE_DOUBLE_CLICK,
    mouseDoubleClick
  );
  element.addEventListener(VtkjsToolsEvents.MOUSE_DRAG, mouseDrag);
  element.addEventListener(VtkjsToolsEvents.MOUSE_MOVE, mouseMove);
  element.addEventListener(VtkjsToolsEvents.MOUSE_UP, mouseUp);
  element.addEventListener(VtkjsToolsEvents.MOUSE_WHEEL, mouseWheel);
};

const disable = function(element) {
  element.removeEventListener(VtkjsToolsEvents.MOUSE_CLICK, mouseClick);
  element.removeEventListener(VtkjsToolsEvents.MOUSE_DOWN, mouseDown);
  element.removeEventListener(
    VtkjsToolsEvents.MOUSE_DOWN_ACTIVATE,
    mouseDownActivate
  );
  element.removeEventListener(
    VtkjsToolsEvents.MOUSE_DOUBLE_CLICK,
    mouseDoubleClick
  );
  element.removeEventListener(VtkjsToolsEvents.MOUSE_DRAG, mouseDrag);
  element.removeEventListener(VtkjsToolsEvents.MOUSE_MOVE, mouseMove);
  element.removeEventListener(VtkjsToolsEvents.MOUSE_UP, mouseUp);
  element.removeEventListener(VtkjsToolsEvents.MOUSE_WHEEL, mouseWheel);
};

export default {
  enable,
  disable,
};
