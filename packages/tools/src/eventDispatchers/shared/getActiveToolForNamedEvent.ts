import { ToolGroupManager } from '../../store';
import { ToolModes } from '../../enums';
import { keyEventListener } from '../../eventListeners';
import { EventTypes } from '../../types';
import getMouseModifier from './getMouseModifier';

const { Active } = ToolModes;

/**
 * Iterate tool group tools until we find a tool that has a "ToolBinding"
 * that matches the named event. It's possible there will be no match.
 *
 * @param evt - The event dispatcher mouse event.
 *
 * @returns tool
 */
export default function getActiveToolForMouseEvent(
  name: string,
  evt: EventTypes.MouseWheelEventType
) {
  // Todo: we should refactor this to use getToolsWithModesForMouseEvent instead
  const { renderingEngineId, viewportId } = evt.detail;
  const namedEvent = evt.detail.event;

  // If any keyboard modifier key is also pressed - get the mouse version
  // first since it handle combinations, while the key event handles non-modifier
  // keys
  const modifierKey =
    getMouseModifier(namedEvent) || keyEventListener.getModifierKey();

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
          binding.namedEvent === name && binding.modifierKey === modifierKey
        );
      });

    if (toolOptions.mode === Active && correctBinding) {
      return toolGroup.getToolInstance(toolName);
    }
  }
}
