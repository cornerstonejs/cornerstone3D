import { ToolGroupManager } from '../../store';
import { ToolModes } from '../../enums';
import { EventTypes } from '../../types';

type ModesFilter = Array<ToolModes>;

/**
 * Given the normalized mouse event and a filter of modes,
 * find all the tools on the element that are in one of the specified modes.
 * If the evtButton is specified, only tools with a matching binding will be returned.
 * @param evt - The normalized mouseDown event.
 * @param modesFilter - An array of entries from the `ToolModes` enum.
 */
export default function getToolsWithModesForMouseEvent(
  evt: EventTypes.MouseMoveEventType,
  modesFilter: ModesFilter,
  evtButton?: any
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

    // tool has binding that matches the mouse button - we match those with
    // any modifier keys too since they can be passively interacted with
    const correctBinding =
      evtButton != null && // not null or undefined
      tool.bindings.length &&
      tool.bindings.some((binding) => binding.mouseButton === evtButton);

    if (
      modesFilter.includes(tool.mode) &&
      // Should not filter by event's button
      // or should, and the tool binding includes the event's button
      (!evtButton || correctBinding)
    ) {
      const toolInstance = toolGroup.getToolInstance(toolName);
      enabledTools.push(toolInstance);
    }
  }

  return enabledTools;
}
