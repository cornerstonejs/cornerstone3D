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
  element.removeEventListener('mousedown', mouseDownListener);
  element.removeEventListener('mousemove', mouseMoveListener);
  // The mouseDoubleClickIgnoreListener prevents those browser 'dblclick'
  // events that cornerstone has determined are single clicks from propagating
  // to other (3rd party) listeners. A capture phase listener is used so that
  // the 'dblclick' event can be ignored and not propagated ASAP.
  element.removeEventListener('dblclick', mouseDoubleClickIgnoreListener, {
    capture: true,
  });
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
  // The mouseDoubleClickIgnoreListener prevents those browser 'dblclick'
  // events that cornerstone has determined are single clicks from propagating
  // to other (3rd party) listeners. A capture phase listener is used so that
  // the 'dblclick' event can be ignored and not propagated ASAP.
  element.addEventListener('dblclick', mouseDoubleClickIgnoreListener, {
    capture: true,
  });
}

export default {
  enable,
  disable,
};
