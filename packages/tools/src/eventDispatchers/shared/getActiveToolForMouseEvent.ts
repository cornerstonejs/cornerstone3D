import { ToolGroupManager } from '../../store';
import { ToolModes } from '../../enums';
import { keyEventListener } from '../../eventListeners';
import { EventTypes } from '../../types';
import getMouseModifier from './getMouseModifier';

const { Active } = ToolModes;

/**
 * Iterate tool group tools until we find a tool that has a "ToolBinding"
 * that matches our MouseEvent's `buttons`. It's possible there will be no match
 * (no active tool for that mouse button combination).
 *
 * @param evt - The event dispatcher mouse event.
 *
 * @returns tool
 */
export default function getActiveToolForMouseEvent(
  evt: EventTypes.NormalizedMouseEventType
) {
  // Todo: we should refactor this to use getToolsWithModesForMouseEvent instead
  const { renderingEngineId, viewportId } = evt.detail;
  const mouseEvent = evt.detail.event;

  // If any keyboard modifier key is also pressed - get the mouse version
  // first since it handles combinations, while the key event handles non-modifier
  // keys.
  const modifierKey =
    getMouseModifier(mouseEvent) || keyEventListener.getModifierKey();

  const toolGroup = ToolGroupManager.getToolGroupForViewport(
    viewportId,
    renderingEngineId
  );

  if (!toolGroup) {
    return null;
  }

  const toolGroupToolNames = Object.keys(toolGroup.toolOptions);
  const defaultMousePrimary = toolGroup.getDefaultMousePrimary();

  for (let j = 0; j < toolGroupToolNames.length; j++) {
    const toolName = toolGroupToolNames[j];
    const toolOptions = toolGroup.toolOptions[toolName];

    // tool has binding that matches the mouse button, if mouseEvent is undefined
    // it uses the primary button
    const correctBinding =
      toolOptions.bindings.length &&
      toolOptions.bindings.some((binding) => {
        return (
          binding.mouseButton ===
            (mouseEvent ? mouseEvent.buttons : defaultMousePrimary) &&
          binding.modifierKey === modifierKey
        );
      });

    if (toolOptions.mode === Active && correctBinding) {
      return toolGroup.getToolInstance(toolName);
    }
  }
}
