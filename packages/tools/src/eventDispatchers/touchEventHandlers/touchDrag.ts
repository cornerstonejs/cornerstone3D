import getActiveToolForTouchEvent from '../shared/getActiveToolForTouchEvent';
import getTouchCallbackWithMouseFallback from '../shared/getTouchCallbackWithMouseFallback';
import releaseToolForMultiTouchGesture from '../shared/releaseToolForMultiTouchGesture';
import { state } from '../../store/state';
import type { TouchDragEventType } from '../../types/EventTypes';

/**
 * touchDrag - Event handler for touchDrag events. Fires the `touchDragCallback`
 * function on the active tool, falling back to `mouseDragCallback` for tools
 * that declare 'Touch' support.
 */
export default function touchDrag(evt: TouchDragEventType) {
  // Must run before the interaction guard: an extra finger arriving mid-drag
  // reclassifies the gesture as a manipulation, but the tool owning the draw
  // loop has already set isInteractingWithTool, so the guard below would
  // return before the gesture could re-resolve to the two-finger binding.
  const bypassInteractionGuard = releaseToolForMultiTouchGesture(evt);

  if (state.isInteractingWithTool && !bypassInteractionGuard) {
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
