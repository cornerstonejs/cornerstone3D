import getActiveToolForMouseEvent from '../shared/getActiveToolForMouseEvent';
import { state } from './../../store/index';

export default function(evt) {
  if (state.isToolLocked) {
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
