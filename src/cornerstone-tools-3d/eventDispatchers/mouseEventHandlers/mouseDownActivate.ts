import addNewMeasurement from './addNewMeasurement';
import { state } from './../../store/index';
import { BaseAnnotationTool } from './../../tools/base';
import getActiveToolForMouseEvent from '../shared/getActiveToolForMouseEvent';

/**
 * mouseDownActivate - If the `mouseDown` handler does not consume an event,
 * activate the creation loop of the active tool, if one is found for the
 * mouse button pressed.
 *
 * @param evt The normalized mouseDown event.
 */
export default function mouseDownActivate(evt) {
  // If a tool has locked the current state it is dealing with an interaction within its own eventloop.
  if (state.isToolLocked) {
    return;
  }

  const activeTool = getActiveToolForMouseEvent(evt);

  if (!activeTool) {
    return;
  }

  if (state.isMultiPartToolActive) {
    return;
  }

  // Note: custom `addNewMeasurement` will need to prevent event bubbling
  if (activeTool.addNewMeasurement) {
    activeTool.addNewMeasurement(evt, 'mouse');
  } else if (activeTool instanceof BaseAnnotationTool) {
    addNewMeasurement(evt, activeTool);
  }
}
