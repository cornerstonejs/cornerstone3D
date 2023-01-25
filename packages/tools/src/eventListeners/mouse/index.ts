import mouseDoubleClickListener from './mouseDoubleClickListener';
import mouseDownListener, {
  mouseDoubleClickIgnoreListener,
} from './mouseDownListener';
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

  // A separate double click listener at the root element. Separate because...
  // - it listens on the capture phase (and not the typical bubble phase)
  // - the data used to ignore the double click is private to mouseDoubleClickIgnoreListener
  document.removeEventListener('dblclick', mouseDoubleClickIgnoreListener, {
    capture: true, // capture phase is the best way to ignore double clicks
  });

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
  document.addEventListener('dblclick', mouseDoubleClickIgnoreListener, {
    capture: true,
  });

  element.addEventListener('mousedown', mouseDownListener);
  element.addEventListener('mousemove', mouseMoveListener);
}

export default {
  enable,
  disable,
};
