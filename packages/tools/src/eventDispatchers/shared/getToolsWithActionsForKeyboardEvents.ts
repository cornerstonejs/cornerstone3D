import { KeyboardBindings, type ToolModes } from '../../enums';
import { getToolGroupForViewport } from '../../store/ToolGroupManager';
import type { EventTypes } from '../../types';

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
  const toolGroup = getToolGroupForViewport(viewportId, renderingEngineId);
  if (!toolGroup) {
    return toolsWithActions;
  }

  const toolGroupToolNames = Object.keys(toolGroup.toolOptions);

  const { key, ctrl, meta, alt, shift } = evt.detail;

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

    const modifierCombinations = {
      undefined: !ctrl && !meta && !shift && !alt,
      [KeyboardBindings.Ctrl]: ctrl && !meta && !shift && !alt,
      [KeyboardBindings.Meta]: !ctrl && meta && !shift && !alt,
      [KeyboardBindings.Shift]: !ctrl && !meta && shift && !alt,
      [KeyboardBindings.Alt]: !ctrl && !meta && !shift && alt,
      [KeyboardBindings.ShiftCtrl]: ctrl && !meta && shift && !alt,
      [KeyboardBindings.ShiftMeta]: !ctrl && meta && shift && !alt,
      [KeyboardBindings.ShiftAlt]: !ctrl && !meta && shift && alt,
      [KeyboardBindings.CtrlAlt]: ctrl && !meta && !shift && alt,
      [KeyboardBindings.CtrlMeta]: ctrl && meta && !shift && !alt,
      [KeyboardBindings.AltMeta]: !ctrl && meta && !shift && alt,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const action = actions.find((action: any) =>
      action.bindings?.some((binding) => {
        const hasCorrectModifier = !!modifierCombinations[binding.modifierKey];
        return binding.key === key && hasCorrectModifier;
      })
    );

    if (action) {
      toolsWithActions.set(tool, action);
    }
  }

  return toolsWithActions;
}
