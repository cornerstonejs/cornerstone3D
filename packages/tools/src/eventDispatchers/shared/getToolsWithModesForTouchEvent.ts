import { ToolGroupManager } from '../../store';
import { ToolModes } from '../../enums';
import { EventTypes } from '../../types';

type ModesFilter = Array<ToolModes>;

/**
 * Given the normalized touch event and a filter of modes,
 * find all the tools on the element that are in one of the specified modes.
 * If the evtButton is specified, only tools with a matching binding will be returned.
 * @param evt - The normalized touchStart event.
 * @param modesFilter - An array of entries from the `ToolModes` enum.
 */
export default function getToolsWithModesForTouchEvent(
  evt: EventTypes.NormalizedTouchEventType,
  modesFilter: ModesFilter,
  numTouchPoints?: number
) {
  const { renderingEngineId, viewportId } = evt.detail;
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
    const tool = toolGroup.toolOptions[toolName];

    const correctBinding =
      numTouchPoints != null &&
      tool.bindings.length &&
      tool.bindings.some(
        (binding) => binding.numTouchPoints === numTouchPoints
      );

    if (
      modesFilter.includes(tool.mode) &&
      (!numTouchPoints || correctBinding)
    ) {
      const toolInstance = toolGroup.getToolInstance(toolName);
      enabledTools.push(toolInstance);
    }
  }

  return enabledTools;
}
