import Events from '../enums/Events';

import {
  touchStart,
  touchStartActivate,
  touchDrag,
  touchEnd,
  touchTap,
  touchPress,
} from './touchEventHandlers';

/**
 * Enable these listeners are emitted in order, and can be cancelled/prevented from bubbling
 * by any previous event.
 *
 * @param element - The element to add the event listeners to.
 */
const enable = function (element: HTMLDivElement): void {
  element.addEventListener(Events.TOUCH_START, touchStart as EventListener);
  element.addEventListener(
    Events.TOUCH_START_ACTIVATE,
    touchStartActivate as EventListener
  );
  element.addEventListener(Events.TOUCH_DRAG, touchDrag as EventListener);
  element.addEventListener(Events.TOUCH_END, touchEnd as EventListener);
  element.addEventListener(Events.TOUCH_TAP, touchTap as EventListener);
  element.addEventListener(Events.TOUCH_PRESS, touchPress as EventListener);
};

/**
 * Disable and Remove the MouseToolEventDispatcher handlers from the element.
 *
 * @param element - HTMLDivElement
 */
const disable = function (element: HTMLDivElement) {
  element.removeEventListener(Events.TOUCH_START, touchStart as EventListener);
  element.removeEventListener(
    Events.TOUCH_START_ACTIVATE,
    touchStartActivate as EventListener
  );
  element.removeEventListener(Events.TOUCH_DRAG, touchDrag as EventListener);
  element.removeEventListener(Events.TOUCH_END, touchEnd as EventListener);
  element.removeEventListener(Events.TOUCH_PRESS, touchPress as EventListener);
};

const touchToolEventDispatcher = {
  enable,
  disable,
};

export default touchToolEventDispatcher;
