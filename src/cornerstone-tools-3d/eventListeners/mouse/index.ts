import mouseDoubleClickListener from './mouseDoubleClickListener';
import mouseDownListener from './mouseDownListener';
import mouseMoveListener from './mouseMoveListener';

/**
 * Removes mouse event listeners for native mouse event. Enables
 * vtk.js tools flavored events that build on top of existing events to
 * provide more helpful information.
 *
 * @private
 * @param enabledDomElement
 */
function disable(enabledDomElement: HTMLElement): void {
  enabledDomElement.removeEventListener('dblclick', mouseDoubleClickListener);
  enabledDomElement.removeEventListener('mousedown', mouseDownListener);
  enabledDomElement.removeEventListener('mousemove', mouseMoveListener);
}

/**
 * Registers mouse event listeners for native mouse event. Enables
 * vtk.js tools flavored events that build on top of existing events to
 * provide more helpful information.
 *
 * @private
 * @param enabledDomElement
 */
function enable(enabledDomElement: HTMLElement): void {
  // Prevent handlers from being attached multiple times
  disable(enabledDomElement);

  enabledDomElement.addEventListener('dblclick', mouseDoubleClickListener);
  enabledDomElement.addEventListener('mousedown', mouseDownListener);
  enabledDomElement.addEventListener('mousemove', mouseMoveListener);
}

export default {
  enable,
  disable,
};
