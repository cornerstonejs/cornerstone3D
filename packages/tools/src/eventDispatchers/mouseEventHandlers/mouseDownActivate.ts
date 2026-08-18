import { state } from '../../store/state';
import getActiveToolForMouseEvent from '../shared/getActiveToolForMouseEvent';
import { setAnnotationSelected } from '../../stateManagement/annotation/annotationSelection';
import type { EventTypes } from '../../types';
import { utilities as cornerstoneUtilities } from '@cornerstonejs/core';

const cs3dLogger = cornerstoneUtilities.logger.toolsLog.getLogger(
  'eventDispatchers.mouseEventHandlers.mouseDownActivate'
);

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
    try {
      const annotation = activeTool.addNewAnnotation(evt, 'mouse');
      setAnnotationSelected(annotation.annotationUID);
    } catch (error) {
      cs3dLogger.warn(
        'Error adding new annotation, viewport not ready:',
        error
      );
    }
  }
}
