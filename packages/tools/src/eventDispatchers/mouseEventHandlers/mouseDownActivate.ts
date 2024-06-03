import { state } from '../../store/index.js';
import getActiveToolForMouseEvent from '../shared/getActiveToolForMouseEvent.js';
import { setAnnotationSelected } from '../../stateManagement/annotation/annotationSelection.js';
import { EventTypes } from '../../types/index.js';

/**
 * If the `mouseDown` handler does not consume an event,
 * activate the creation loop of the active tool, if one is found for the
 * mouse button pressed.
 *
 * @param evt - The normalized mouseDown event.
 */
export default function mouseDownActivate(
  evt: EventTypes.MouseDownActivateEventType
) {
  // If a tool has locked the current state it is dealing with an interaction within its own eventLoop.
  if (state.isInteractingWithTool) {
    return;
  }

  const activeTool = getActiveToolForMouseEvent(evt);

  if (!activeTool) {
    return;
  }

  if (state.isMultiPartToolActive) {
    return;
  }

  if (activeTool.addNewAnnotation) {
    const annotation = activeTool.addNewAnnotation(evt, 'mouse');
    setAnnotationSelected(annotation.annotationUID);
  }
}
