import preventGhostClick from './preventGhostClick';
import touchStartListener from './touchStartListener';

/**
 * Removes touch event listeners for native touch event. Enables
 * vtk.js tools flavored events that build on top of existing events to
 * provide more helpful information.
 *
 * @private
 * @param element - The DOM element to remove event listeners from.
 */
function disable(element: HTMLDivElement): void {
  preventGhostClick.disable(element);
  element.removeEventListener('touchstart', touchStartListener);
}

/**
 * Registers touch event listeners for native touch event. Enables
 * vtk.js tools flavored events that build on top of existing events to
 * provide more helpful information.
 *
 * @private
 * @param element - The DOM element to register event listeners on.
 */
function enable(element: HTMLDivElement): void {
  // Prevent handlers from being attached multiple times
  disable(element);
  preventGhostClick.enable(element);
  element.addEventListener('touchstart', touchStartListener, {
    passive: false,
  });
}

export default {
  enable,
  disable,
};
