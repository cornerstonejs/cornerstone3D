import {
  mouseEventListeners,
  wheelEventListener,
} from './../eventListeners/index'
import {
  imageRenderedEventDispatcher,
  cameraModifiedEventDispatcher,
  mouseToolEventDispatcher,
  //   touchToolEventDispatcher,
} from './../eventDispatchers/index'
// ~~
import { getEnabledElement } from '@vtk-viewport'

import { state } from './index'

function removeEnabledElement(elementDisabledEvt) {
  // Is DOM element
  const canvas = elementDisabledEvt.detail.canvas
  // Is construct - WON'T BE ABLE TO GET
  //const enabledElement = getEnabledElement(canvas);

  // Listeners
  mouseEventListeners.disable(canvas)
  wheelEventListener.disable(canvas)
  // Dispatchers: renderer
  imageRenderedEventDispatcher.disable(canvas)
  cameraModifiedEventDispatcher.disable(canvas)
  // Dispatchers: interaction
  mouseToolEventDispatcher.disable(canvas)
  // touchToolEventDispatcher.disable(canvas);

  // State
  // @TODO: Remove enabledElement from Synchronizer Managers & Tool Groups/Managers?
  // @TODO: We used to "disable" the tool before removal. Should we preserve the hook that would call on tools?
  //_removeAllToolsForElement(enabledElement);
  _removeEnabledElement(canvas)
}

const _removeAllToolsForElement = function (enabledElement) {
  // store.state.tools.forEach(tool => {
  //   if (tool.element === enabledElement) {
  //     setToolDisabledForElement(tool.element, tool.name);
  //   }
  // });
  // store.state.tools = store.state.tools.filter(
  //   tool => tool.element !== enabledElement
  // );
}

/**
 * @private
 * @param enabledElement
 */
const _removeEnabledElement = function (enabledElement: HTMLElement) {
  const foundElementIndex = state.enabledElements.findIndex(
    (element) => element === enabledElement
  )

  if (foundElementIndex > -1) {
    state.enabledElements.splice(foundElementIndex, 1)
  }
}

export default removeEnabledElement
