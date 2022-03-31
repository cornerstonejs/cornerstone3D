import wheelListener from './wheelListener';

/**
 * Listens for the wheel event, and handles it. Handled event
 * will be "normalized" and re-emitted as `Events.MOUSE_WHEEL`
 *
 * @param element - The HTML element
 */
function enable(element: HTMLDivElement) {
  disable(element);
  element.addEventListener('wheel', wheelListener, { passive: false });
}

/**
 * Removes listener and handler for wheel event. `Events.MOUSE_WHEEL`
 * will no longer be emitted.
 *
 * @param element - THe HTML element
 */
function disable(element: HTMLDivElement) {
  element.removeEventListener('wheel', wheelListener);
}

export default {
  enable,
  disable,
};
