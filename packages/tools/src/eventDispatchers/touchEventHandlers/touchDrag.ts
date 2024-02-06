import getActiveToolForTouchEvent from '../shared/getActiveToolForTouchEvent';
import { state } from '../../store';
import { TouchDragEventType } from '../../types/EventTypes';

/**
 * touchDrag - Event handler for touchDrag events. Uses `customCallbackHandler` to fire
 * the `touchDragCallback` function on active tools.
 */
export default function touchDrag(evt: TouchDragEventType) {
  if (state.isInteractingWithTool) {
    return;
  }

  const activeTool = getActiveToolForTouchEvent(evt);

  const noFoundToolOrDoesNotHaveTouchDragCallback =
    !activeTool || typeof activeTool.touchDragCallback !== 'function';
  if (noFoundToolOrDoesNotHaveTouchDragCallback) {
    return;
  }

  activeTool.touchDragCallback(evt);
}
