import { ToolGroupManager } from '../../store';
import { ToolModes } from '../../enums';
import { EventTypes } from '../../types';

/**
 * Given the normalized mouse event and a filter of modes,
 * find all the tools on the element that are in one of the specified modes.
 * If the evtButton is specified, only tools with a matching binding will be returned.
 * @param evt - The normalized mouseDown event.
 * @param modesFilter - An array of entries from the `ToolModes` enum.
 */
export default function getToolsWithModesForKeyboardEvent(
  evt: EventTypes.KeyDownEventType,
  toolModes: ToolModes[]
) {
  const toolsWithActions = new Map();
  const { renderingEngineId, viewportId } = evt.detail;
  const toolGroup = ToolGroupManager.getToolGroupForViewport(
    viewportId,
    renderingEngineId
  );

  if (!toolGroup) {
    return toolsWithActions;
  }

  const toolGroupToolNames = Object.keys(toolGroup.toolOptions);
  const key = evt.detail.key;

  for (let j = 0; j < toolGroupToolNames.length; j++) {
    const toolName = toolGroupToolNames[j];
    const tool = toolGroup.getToolInstance(toolName);
    const actionsConfig = tool.configuration?.actions;
    if (!actionsConfig) {
      continue;
    }
    const actions = Object.values(actionsConfig);

    if (!actions?.length || !toolModes.includes(tool.mode)) {
      continue;
    }

    const action = actions.find((action: any) =>
      action.bindings.some((binding) => binding.key === key)
    );

    if (action) {
      toolsWithActions.set(tool, action);
    }
  }

  return toolsWithActions;
}
