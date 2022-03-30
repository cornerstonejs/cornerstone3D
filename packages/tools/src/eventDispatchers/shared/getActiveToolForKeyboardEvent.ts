import { ToolGroupManager } from '../../store';
import { ToolModes, MouseBindings } from '../../enums';
import { keyEventListener } from '../../eventListeners';
import { EventTypes } from '../../types';
import { getMouseButton } from '../../eventListeners/mouse/mouseDownListener';

const { Active } = ToolModes;

/**
 * Iterate tool group tools until we find a tool that has a "ToolBinding"
 * that matches our Keyboard pressed keys. It's possible there will be no match
 * (no active tool for that mouse button combination).
 *
 * @param evt - The normalized keyboard event.
 *
 * @returns tool
 */
export default function getActiveToolForKeyboardEvent(
  evt: EventTypes.KeyDownEventType
) {
  const { renderingEngineId, viewportId } = evt.detail;

  // Get the current mouse button clicked
  const mouseButton = getMouseButton();

  // If any keyboard modifier key is also pressed
  const modifierKey = keyEventListener.getModifierKey();

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
      toolOptions.bindings.some(
        (binding) =>
          binding.mouseButton === (mouseButton ?? MouseBindings.Primary) &&
          binding.modifierKey === modifierKey
      );

    if (toolOptions.mode === Active && correctBinding) {
      return toolGroup.getToolInstance(toolName);
    }
  }
}
