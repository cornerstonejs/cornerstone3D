import { state } from './../../store/index';
// import getActiveToolsForElement from './../../store/getActiveToolsForElement.js';
// import filterToolsUseableWithMultiPartTools from './../../store/filterToolsUsableWithMultiPartTools.js';

/**
 *
 * @param handlerType - 'Mouse' | 'Touch'
 * @param customFunction - Function name that's expected to live on implementing
 *   (and event handling) active tool ex. 'doubleClickCallback'
 * @param evt
 */
export default function(handlerType: string, customFunction: string, evt) {
  if (state.isToolLocked) {
    return false;
  }

  // @TODO: This should be canvas...?
  // And we need to get tools based on viewport by toolgroup
  const element = evt.detail.element;
  // let tools = state.tools.filter(tool =>
  //   tool.supportedInteractionTypes.includes(handlerType)
  // );

  // Tool is active, and specific callback is active
  // tools = getActiveToolsForElement(element, tools, handlerType);

  // Tool has expected callback custom function
  // tools = tools.filter(tool => typeof tool[customFunction] === 'function');

  // if (state.isMultiPartToolActive) {
  //   tools = filterToolsUseableWithMultiPartTools(tools);
  // }

  // if (tools.length === 0) {
  //   return false;
  // }

  // tools[0][customFunction](evt);
}
