import { ToolGroupManager } from '../../store';
import getActiveToolForKeyboardEvent from '../shared/getActiveToolForKeyboardEvent';
import { KeyDownEventType } from '../../types/EventTypes';

/**
 * KeyDown event listener to handle viewport cursor icon changes
 *
 * @param evt - The KeyboardEvent
 */
export default function keyDown(evt: KeyDownEventType): void {
  // get the active tool given the key and mouse button
  const activeTool = getActiveToolForKeyboardEvent(evt);

  if (!activeTool) {
    return;
  }

  const { renderingEngineId, viewportId } = evt.detail;

  const toolGroup = ToolGroupManager.getToolGroupForViewport(
    viewportId,
    renderingEngineId
  );

  const toolName = activeTool.getToolName();
  if (Object.keys(toolGroup.toolOptions).includes(toolName)) {
    toolGroup.setViewportsCursorByToolName(toolName);
  }
}
