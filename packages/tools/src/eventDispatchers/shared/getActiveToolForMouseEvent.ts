import { ToolGroupManager } from '../../store';
import { MouseBindings, ToolModes } from '../../enums';
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

  // If any keyboard modifier key is also pressed
  // Use the actual key if set, otherwise get the key from the mouse event.
  const modifierKey =
    keyEventListener.getModifierKey() || getMouseModifier(mouseEvent);

  const toolGroup = ToolGroupManager.getToolGroupForViewport(
    viewportId,
    renderingEngineId
  );

  if (!toolGroup) {
    return null;
  }

  const toolGroupToolNames = Object.keys(toolGroup.toolOptions);

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
            (mouseEvent ? mouseEvent.buttons : MouseBindings.Primary) &&
          binding.modifierKey === modifierKey
        );
      });

    if (toolOptions.mode === Active && correctBinding) {
      return toolGroup.getToolInstance(toolName);
    }
  }
}
