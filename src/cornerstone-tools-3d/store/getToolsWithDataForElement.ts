import { getToolState } from './../stateManagement/toolState';
import { ToolAndToolStateArray } from '../types/toolStateTypes'

/**
 * @function getToolsWithDataForElement Filters an array of tools, returning only
 * tools which have annotation data.
 *
 * @param  {HTMLElement} element The cornerstone3D enabled element.
 * @param  {Object[]} tools The array of tools to check.
 *
 * @returns {ToolAndToolStateArray} The array of tools with their found toolState.
 */
export default function getToolsWithDataForElement(
  element: HTMLElement,
  tools
): ToolAndToolStateArray {
  const result = [];

  for (let i = 0; i < tools.length; i++) {
    const tool = tools[i];

    if (!tool) {
      console.warn('undefined tool in getToolsWithDataForElement');
      continue;
    }

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
