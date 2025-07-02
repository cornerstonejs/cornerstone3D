import { KeyboardBindings, ToolModes } from '../../enums';
import { keyEventListener } from '../../eventListeners';
import { getToolGroupForViewport } from '../../store/ToolGroupManager';
import type { EventTypes } from '../../types';
import getMouseModifier from './getMouseModifier';

const { Active } = ToolModes;

/**
 * Iterate tool group tools until we find a tool that has a "ToolBinding"
 * that matches our MouseEvent's `buttons`. It's possible there will be no match
 * (no active tool for that mouse button combination), in which case undefined
 * is returned.
 *
 * The buttons used for matching are first from the `evt.buttons`, then the `evt.detail.event.buttons`
 * and finally defaulting to the primary mouse button if none are defined.  This
 * allows over-riding the buttons, as one can't update the event buttons.
 *
 * @param evt - The event dispatcher mouse event.
 *
 * @returns tool
 */
export default function getActiveToolForMouseEvent(
  evt: EventTypes.NormalizedMouseEventType
) {
  // Todo: we should refactor this to use getToolsWithModesForMouseEvent instead
  const { renderingEngineId, viewportId, event: mouseEvent } = evt.detail;

  const shift = mouseEvent.shiftKey;
  const ctrl = mouseEvent.ctrlKey;
  const meta = mouseEvent.metaKey;
  const alt = mouseEvent.altKey;

  const toolGroup = getToolGroupForViewport(viewportId, renderingEngineId);

  if (!toolGroup) {
    return null;
  }

  const toolGroupToolNames = Object.keys(toolGroup.toolOptions);
  const defaultMousePrimary = toolGroup.getDefaultMousePrimary();
  const mouseButton =
    mouseEvent.buttons ?? mouseEvent?.buttons ?? defaultMousePrimary;

  for (let j = 0; j < toolGroupToolNames.length; j++) {
    const toolName = toolGroupToolNames[j];
    const toolOptions = toolGroup.toolOptions[toolName];

    // tool has binding that matches the mouse button, if mouseEvent is undefined
    // it uses the primary button
    const correctBinding =
      toolOptions.bindings.length &&
      toolOptions.bindings.some((binding) => {
        const hasCorrectMouseButton = binding.mouseButton === mouseButton;
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
        const hasCorrectModifier = !!modifierCombinations[binding.modifierKey];
        return hasCorrectMouseButton && hasCorrectModifier;
      });

    if (toolOptions.mode === Active && correctBinding) {
      return toolGroup.getToolInstance(toolName);
    }
  }
}
