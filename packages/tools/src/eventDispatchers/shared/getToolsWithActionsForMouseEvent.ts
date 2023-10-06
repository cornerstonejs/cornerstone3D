import { ToolGroupManager } from '../../store';
import { ToolModes } from '../../enums';
import { ToolAction, EventTypes } from '../../types';

import { keyEventListener } from '../../eventListeners';
import getMouseModifier from './getMouseModifier';

type ModesFilter = Array<ToolModes>;

/**
 * Given the normalized mouse event and a filter of modes, find all the tools
 * on the element that have actions and are in one of the specified modes.
 * @param evt - The normalized mouseDown event.
 * @param modesFilter - An array of entries from the `ToolModes` enum.
 */
export default function getToolsWithActionsForMouseEvent(
  evt: EventTypes.MouseMoveEventType,
  modesFilter: ModesFilter
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
    const actions = tool.configuration?.actions;

    if (!actions?.length || !modesFilter.includes(tool.mode)) {
      continue;
    }

    const action = actions.find(
      (action) =>
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
