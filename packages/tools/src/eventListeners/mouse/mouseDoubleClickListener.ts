import { getEnabledElement, triggerEvent } from '@cornerstonejs/core';
import Events from '../../enums/Events';
import getMouseEventPoints from './getMouseEventPoints';
import { EventTypes, IPoints } from '../../types';

/**
 * Captures and normalizes the double click event. Emits as a cornerstoneTools3D
 * double click event.
 *
 * @param evt - The mouse event.
 */
function mouseDoubleClickListener(evt: MouseEvent): void {
  const element = <HTMLDivElement>evt.currentTarget;

  const { viewportId, renderingEngineId } = getEnabledElement(element);

  const startPoints = getMouseEventPoints(evt, element);
  const deltaPoints: IPoints = {
    page: [0, 0],
    client: [0, 0],
    canvas: [0, 0],
    world: [0, 0, 0],
  };

  const eventDetail: EventTypes.MouseDoubleClickEventDetail = {
    event: evt,
    eventName: Events.MOUSE_DOUBLE_CLICK,
    viewportId,
    renderingEngineId,
    camera: {},
    element,
    startPoints,
    lastPoints: startPoints,
    currentPoints: startPoints,
    deltaPoints,
  };

  const consumed = !triggerEvent(
    element,
    Events.MOUSE_DOUBLE_CLICK,
    eventDetail
  );

  if (consumed) {
    // The Events.MOUSE_DOUBLE_CLICK was consumed, thus no other listener should handle this 'dblclick' event.

    // Use stopImmediatePropagation to lessen the possibility that a third party 'dblclick'
    // listener receives this event. However, there still is no guarantee
    // that any third party listener has not already handled the event.
    evt.stopImmediatePropagation();
    evt.preventDefault();
  }
}

export default mouseDoubleClickListener;
