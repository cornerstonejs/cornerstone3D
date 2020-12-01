import { mouseEventListeners } from './../eventListeners/index';
import {
  //   imageRenderedEventDispatcher,
  mouseToolEventDispatcher,
  //   newImageEventDispatcher,
  //   touchToolEventDispatcher,
} from './../eventDispatchers/index';
// ~~
import { getEnabledElement } from './../../index';
import { state } from './index';

export default function(elementDisabledEvt) {
  // Is DOM element
  const canvas = elementDisabledEvt.detail.canvas;
  // Is construct
  const enabledElement = getEnabledElement(canvas);

  console.log('~~ EnabledDisabledEvent, add: ', canvas, enabledElement);

  // Listeners
  mouseEventListeners.disable(canvas);
  // Dispatchers: renderer
  // imageRenderedEventDispatcher.disable(canvas);
  // newImageEventDispatcher.disable(canvas);
  // Dispatchers: interaction
  mouseToolEventDispatcher.disable(canvas);
  // touchToolEventDispatcher.disable(canvas);

  // State
  // @TODO: Remove enabledElement from Synchronizer Managers & Tool Groups/Managers?
  // @TODO: We used to "disable" the tool before removal. Should we preserve the hook that would call on tools?
  //_removeAllToolsForElement(enabledElement);
  _removeEnabledElement(canvas);
}

const _removeAllToolsForElement = function(enabledElement) {
  // store.state.tools.forEach(tool => {
  //   if (tool.element === enabledElement) {
  //     setToolDisabledForElement(tool.element, tool.name);
  //   }
  // });
  // store.state.tools = store.state.tools.filter(
  //   tool => tool.element !== enabledElement
  // );
};

/**
 * @private
 * @param enabledElement
 */
const _removeEnabledElement = function(enabledElement: HTMLElement) {
  const foundElementIndex = state.enabledElements.findIndex(
    element => element === enabledElement
  );

  if (foundElementIndex > -1) {
    state.enabledElements.splice(foundElementIndex, 1);
  }
};
