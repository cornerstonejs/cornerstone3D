import {
  mouseEventListeners,
  wheelEventListener,
} from './../eventListeners/index';
import {
  imageRenderedEventDispatcher,
  mouseToolEventDispatcher,
} from './../eventDispatchers/index';
import { state } from './index';

/**
 * @function addEnabledElement On enabling an element, enable event listeners
 * and dispatchers on this element so we can interact with tools.
 *
 * @param {CustomEvent} evt The ELEMENT_ENABLED event.
 */
export default function addEnabledElement(evt) {
  const canvas = <HTMLElement>evt.detail.canvas;

  // Listeners
  mouseEventListeners.enable(canvas);
  wheelEventListener.enable(canvas);
  // Dispatchers: renderer
  imageRenderedEventDispatcher.enable(canvas);
  // Dispatchers: interaction
  mouseToolEventDispatcher.enable(canvas);
  // touchToolEventDispatcher.enable(enabledElement);

  // State
  state.enabledElements.push(canvas);
}
