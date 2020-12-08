import { getToolState } from './../stateManagement/toolState';

/**
 * Filters an array of tools, returning only tools which have annotation data.
 * @export
 * @public
 * @method
 * @name getToolsWithDataForElement
 *
 * @param  {string} element The FrameOfReference
 * @param  {Object[]} tools The input tool array.
 * @returns {Object[]}            The filtered array.
 */
export default function(element, tools) {
  const result = [];

  for (let i = 0; i < tools.length; i++) {
    const tool = tools[i];
    let toolState;

    if (tool.getToolState) {
      // If the tool has its own method of finding toolState for this element (e.g. with perspective/view filtering), use it.
      toolState = tool.getToolState(element);
    } else {
      toolState = getToolState(element, tool.name);
    }

    if (toolState && toolState.length > 0) {
      result.push({ tool, toolState });
    }
  }

  return result;
}
