import { state } from '../../store';
import { EventTypes } from '../../types';
import { setAnnotationSelected } from '../../stateManagement/annotation/annotationSelection';

import getActiveToolForTouchEvent from '../shared/getActiveToolForTouchEvent';

/**
 * If the `touchStart` handler does not consume an event,
 * activate the creation loop of the active tool, if one is found for the
 * touch button pressed.
 *
 * @param evt - The normalized touchStart event.
 */
export default function touchStartActivate(
  evt: EventTypes.TouchStartActivateEventType
) {
  // If a tool has locked the current state it is dealing with an interaction within its own eventLoop.
  if (state.isInteractingWithTool) {
    return;
  }

  const activeTool = getActiveToolForTouchEvent(evt);

  if (!activeTool) {
    return;
  }

  if (state.isMultiPartToolActive) {
    return;
  }

  if (activeTool.addNewAnnotation) {
    const annotation = activeTool.addNewAnnotation(evt, 'touch');
    setAnnotationSelected(annotation.annotationUID);
  }
}
