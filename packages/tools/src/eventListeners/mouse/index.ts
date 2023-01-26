import mouseDoubleClickListener from './mouseDoubleClickListener';
import mouseDownListener from './mouseDownListener';
import mouseMoveListener from './mouseMoveListener';

/**
 * Removes mouse event listeners for native mouse event. Enables
 * vtk.js tools flavored events that build on top of existing events to
 * provide more helpful information.
 *
 * @private
 * @param element - The DOM element to remove event listeners from.
 */
function disable(element: HTMLDivElement): void {
  element.removeEventListener('dblclick', mouseDoubleClickListener);
  element.removeEventListener('mousedown', mouseDownListener);
  element.removeEventListener('mousemove', mouseMoveListener);
}

/**
 * Registers mouse event listeners for native mouse event. Enables
 * vtk.js tools flavored events that build on top of existing events to
 * provide more helpful information.
 *
 * @private
 * @param element - The DOM element to register event listeners on.
 */
function enable(element: HTMLDivElement): void {
  // Prevent handlers from being attached multiple times
  disable(element);

  element.addEventListener('dblclick', mouseDoubleClickListener);
  element.addEventListener('mousedown', mouseDownListener);
  element.addEventListener('mousemove', mouseMoveListener);
}

export default {
  enable,
  disable,
};
