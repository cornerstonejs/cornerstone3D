import { state } from '../../store/state';
import type { EventTypes } from '../../types';
import { setAnnotationSelected } from '../../stateManagement/annotation/annotationSelection';

import getActiveToolForTouchEvent from '../shared/getActiveToolForTouchEvent';
import { utilities as cornerstoneUtilities } from '@cornerstonejs/core';

const cs3dLogger = cornerstoneUtilities.logger.toolsLog.getLogger(
  'eventDispatchers.touchEventHandlers.touchStartActivate'
);

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
    try {
      const annotation = activeTool.addNewAnnotation(evt, 'touch');
      setAnnotationSelected(annotation.annotationUID);
    } catch (error) {
      cs3dLogger.warn(
        'Error adding new annotation, viewport not ready:',
        error
      );
    }
  }
}
