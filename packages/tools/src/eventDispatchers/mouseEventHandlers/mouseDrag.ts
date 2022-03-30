import getActiveToolForMouseEvent from '../shared/getActiveToolForMouseEvent';
import { state } from '../../store';
import { MouseDragEventType } from '../../types/EventTypes';

/**
 * mouseDrag - Event handler for mouse drag events. Fires the `mouseDragCallback`
 * function on active tools.
 *
 * @param evt - The normalized mouseDown event.
 */
export default function mouseDrag(evt: MouseDragEventType) {
  if (state.isInteractingWithTool) {
    return;
  }

  const activeTool = getActiveToolForMouseEvent(evt);

  const noFoundToolOrDoesNotHaveMouseDragCallback =
    !activeTool || typeof activeTool.mouseDragCallback !== 'function';
  if (noFoundToolOrDoesNotHaveMouseDragCallback) {
    return;
  }

  activeTool.mouseDragCallback(evt);
}
