import getActiveToolForTouchEvent from '../shared/getActiveToolForTouchEvent';
import getTouchCallbackWithMouseFallback from '../shared/getTouchCallbackWithMouseFallback';
import { state } from '../../store/state';
import type { TouchDragEventType } from '../../types/EventTypes';

/**
 * touchDrag - Event handler for touchDrag events. Fires the `touchDragCallback`
 * function on the active tool, falling back to `mouseDragCallback` for tools
 * that declare 'Touch' support.
 */
export default function touchDrag(evt: TouchDragEventType) {
  if (state.isInteractingWithTool) {
    return;
  }

  const activeTool = getActiveToolForTouchEvent(evt);

  const dragCallback = getTouchCallbackWithMouseFallback(
    activeTool,
    'touchDragCallback',
    'mouseDragCallback'
  );

  if (!dragCallback) {
    return;
  }

  dragCallback(evt);
}
