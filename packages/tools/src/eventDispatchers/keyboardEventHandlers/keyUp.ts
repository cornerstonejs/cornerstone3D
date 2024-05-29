import { resetModifierKey } from '../../eventListeners/keyboard/keyDownListener.js';
import { ToolGroupManager } from '../../store/index.js';
import getActiveToolForKeyboardEvent from '../shared/getActiveToolForKeyboardEvent.js';
import { KeyDownEventType } from '../../types/EventTypes.js';

/**
 * KeyDown event listener to handle viewport cursor icon changes
 *
 * @param evt - The KeyboardEvent
 */
export default function keyUp(evt: KeyDownEventType): void {
  // get the active tool for the primary mouse button
  const activeTool = getActiveToolForKeyboardEvent(evt);

  if (!activeTool) {
    return;
  }

  const { renderingEngineId, viewportId } = evt.detail;

  const toolGroup = ToolGroupManager.getToolGroupForViewport(
    viewportId,
    renderingEngineId
  );

  // Reset the modifier key
  resetModifierKey();

  const toolName = activeTool.getToolName();
  if (Object.keys(toolGroup.toolOptions).includes(toolName)) {
    toolGroup.setViewportsCursorByToolName(toolName);
  }
}
