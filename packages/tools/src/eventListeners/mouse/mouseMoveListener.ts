import { getEnabledElement, triggerEvent } from '@cornerstonejs/core';
import Events from '../../enums/Events';
import getMouseEventPoints from './getMouseEventPoints';
import { MouseMoveEventDetail } from '../../types/EventTypes';

const eventName = Events.MOUSE_MOVE;

/**
 * Captures and normalizes the mouse move event. Emits as a cornerstoneTools3D
 * mouse move event.
 *
 * @param evt - The mouse event.
 */
function mouseMoveListener(evt: MouseEvent) {
  const element = <HTMLDivElement>evt.currentTarget;
  const enabledElement = getEnabledElement(element);
  const { renderingEngineId, viewportId } = enabledElement;

  const currentPoints = getMouseEventPoints(evt);
  const eventDetail: MouseMoveEventDetail = {
    renderingEngineId,
    viewportId,
    camera: {},
    element,
    currentPoints,
    eventName,
    event: evt,
  };

  triggerEvent(element, eventName, eventDetail);
}

export default mouseMoveListener;
