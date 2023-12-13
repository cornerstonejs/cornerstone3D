import { ToolGroupManager } from '../../store';
import { ToolModes } from '../../enums';
import { ToolAction, EventTypes } from '../../types';

import { keyEventListener } from '../../eventListeners';
import getMouseModifier from './getMouseModifier';

/**
 * Given the mouse event and a list of tool modes, find all tool instances
 * with actions that were added to the tool group associated with the viewport
 * that triggered the event.
 *
 * @param evt - mouseDown event triggered by a cornerstone viewport
 * @param toolModes - List of tool modes used to filter the tools registered
 *                    in the viewport's tool group
 */
export default function getToolsWithActionsForMouseEvent(
  evt: EventTypes.MouseMoveEventType,
  toolModes: ToolModes[]
): Map<any, ToolAction> {
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
  const defaultMousePrimary = toolGroup.getDefaultMousePrimary();
  const mouseEvent = evt.detail.event;
  const mouseButton = mouseEvent?.buttons ?? defaultMousePrimary;
  const modifierKey =
    getMouseModifier(mouseEvent) || keyEventListener.getModifierKey();

  for (let j = 0; j < toolGroupToolNames.length; j++) {
    const toolName = toolGroupToolNames[j];
    const tool = toolGroup.getToolInstance(toolName);
    const actionsConfig = tool.configuration?.actions ?? {};
    const actions = Object.values(actionsConfig);

    if (!actions?.length || !toolModes.includes(tool.mode)) {
      continue;
    }

    const action = actions.find(
      (action: any) =>
        action.bindings.length &&
        action.bindings.some(
          (binding) =>
            binding.mouseButton === mouseButton &&
            binding.modifierKey === modifierKey
        )
    );

    if (action) {
      toolsWithActions.set(tool, action);
    }
  }

  return toolsWithActions;
}
