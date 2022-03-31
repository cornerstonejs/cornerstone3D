import { ToolGroupManager } from '../store';
import { ToolModes } from '../enums';
import { getEnabledElement } from '@cornerstonejs/core';

type ModesFilter = Array<ToolModes>;

/**
 * Finds the enabled element, and iterates over the tools inside its
 * toolGroup. Returns the list of tool instances that are valid based
 * on the provided tool mode.
 *
 * @param element Canvas element
 * @param modesFilter tool modes: active, passive, enabled, disabled
 * @returns enabled tool instances
 */
export default function getToolsWithModesForElement(
  element: HTMLDivElement,
  modesFilter: ModesFilter
) {
  const enabledElement = getEnabledElement(element);
  const { renderingEngineId, viewportId } = enabledElement;

  const toolGroup = ToolGroupManager.getToolGroupForViewport(
    viewportId,
    renderingEngineId
  );

  if (!toolGroup) {
    return [];
  }

  const enabledTools = [];

  const toolGroupToolNames = Object.keys(toolGroup.toolOptions);

  for (let j = 0; j < toolGroupToolNames.length; j++) {
    const toolName = toolGroupToolNames[j];
    const toolOptions = toolGroup.toolOptions[toolName];

    /* filter out tools that don't have options */
    if (!toolOptions) {
      continue;
    }

    if (modesFilter.includes(toolOptions.mode)) {
      const toolInstance = toolGroup.getToolInstance(toolName);
      enabledTools.push(toolInstance);
    }
  }

  return enabledTools;
}
