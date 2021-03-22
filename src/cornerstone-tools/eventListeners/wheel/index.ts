import wheelListener from './wheelListener';

/**
 * Listens for the wheel event, and handles it. Handled event
 * will be "normalized" and re-emitted as `EVENTS.MOUSE_WHEEL`
 *
 * @private
 * @param {HTMLElement} element
 * @returns {undefined}
 */
function enable(element: HTMLElement) {
  disable(element);
  element.addEventListener('wheel', wheelListener, { passive: false });
}

/**
 * Removes listener and handler for wheel event. `EVENTS.MOUSE_WHEEL`
 * will no longer be emitted.
 *
 * @private
 * @param {HTMLElement} element
 * @returns {undefined}
 */
function disable(element: HTMLElement) {
  element.removeEventListener('wheel', wheelListener);
}

export default {
  enable,
  disable,
};
