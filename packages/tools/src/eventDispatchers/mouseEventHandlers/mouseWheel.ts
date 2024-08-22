import { state } from '../../store/state';
import getActiveToolForMouseEvent from '../shared/getActiveToolForMouseEvent';
import type { EventTypes } from '../../types';
import { MouseBindings } from '../../enums/ToolBindings';

/**
 * Event handler for mouse wheel events.
 * This finds the active tool
 */
function mouseWheel(evt: EventTypes.MouseWheelEventType) {
  if (state.isInteractingWithTool) {
    return;
  }

  evt.detail.buttons =
    MouseBindings.Wheel | ((evt.detail.event.buttons as number) || 0);

  const activeTool = getActiveToolForMouseEvent(evt);

  if (!activeTool) {
    return;
  }

  return activeTool.mouseWheelCallback(evt);
}

export default mouseWheel;
