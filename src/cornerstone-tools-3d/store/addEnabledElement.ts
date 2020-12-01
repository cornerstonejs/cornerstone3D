import { mouseEventListeners } from './../eventListeners/index';
// ~~
import { getEnabledElement } from './../../index';
import {
  //   imageRenderedEventDispatcher,
  mouseToolEventDispatcher,
  //   newImageEventDispatcher,
  //   touchToolEventDispatcher,
} from './../eventDispatchers/index';
import { state } from './index';

// @TODO: Should all of this be keyed off `canvas` instead of enabledElement
export default function(elementEnabledEvt) {
  // Is DOM element
  const canvas = elementEnabledEvt.detail.canvas;
  // Is construct
  const enabledElement = getEnabledElement(canvas);

  console.log('~~ EnabledElementEvent, add: ', canvas, enabledElement);

  // const enabledElement = elementEnabledEvt.detail.element;

  // Listeners
  mouseEventListeners.enable(canvas);
  // Dispatchers: renderer
  // imageRenderedEventDispatcher.enable(enabledElement);
  // newImageEventDispatcher.enable(enabledElement);
  // Dispatchers: interaction
  mouseToolEventDispatcher.enable(canvas);
  // touchToolEventDispatcher.enable(enabledElement);

  // State
  state.enabledElements.push(canvas);
}
