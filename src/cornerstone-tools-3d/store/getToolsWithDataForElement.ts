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
    let toolState = getToolState(element, tool.name);

    if (!toolState) {
      continue;
    }

    if (typeof tool.filterInteractableToolStateForElement === 'function') {
      // If the tool has a toolState filter (e.g. with in-plane-annotations-only filtering), use it.
      toolState = tool.filterInteractableToolStateForElement(
        element,
        toolState
      );
    }

    if (toolState.length > 0) {
      result.push({ tool, toolState });
    }
  }

  return result;
}
