import { getEnabledElement, triggerEvent } from '@cornerstonejs/core';
import normalizeWheel from './normalizeWheel';
import Events from '../../enums/Events';
// ~~ VIEWPORT LIBRARY
import getMouseEventPoints from '../mouse/getMouseEventPoints';
import {
  MouseWheelEventDetail,
  MouseWheelEventType,
} from '../../types/EventTypes';
import getActiveToolForNamedEvent from '../../eventDispatchers/shared/getActiveToolForNamedEvent';

/**
 * wheelListener - Captures and normalizes mouse wheel events. Emits as a
 * cornerstoneTools3D mouse wheel event.
 * @param evt - The mouse wheel event.
 */
function wheelListener(evt: WheelEvent) {
  const element = <HTMLDivElement>evt.currentTarget;
  const enabledElement = getEnabledElement(element);
  const { renderingEngineId, viewportId } = enabledElement;

  // Prevent triggering MouseWheel events that are not real scroll events:
  // E.g. when clicking the MiddleMouseWheelButton, a deltaY of 0 is emitted.
  // See https://github.com/cornerstonejs/cornerstoneTools/issues/935
  if (evt.deltaY > -1 && evt.deltaY < 1) {
    return;
  }

  evt.preventDefault();

  const { spinX, spinY, pixelX, pixelY } = normalizeWheel(evt);
  const direction = spinY < 0 ? -1 : 1;

  const eventDetail: MouseWheelEventDetail = {
    event: evt,
    eventName: Events.MOUSE_WHEEL,
    renderingEngineId,
    viewportId,
    element,
    detail: evt,
    camera: {},
    wheel: {
      spinX,
      spinY,
      pixelX,
      pixelY,
      direction,
    },
    deltaPoints: {
      canvas: [direction, direction],
    },
    points: getMouseEventPoints(evt),
  };

  const event: MouseWheelEventType = {
    ...evt,
    detail: eventDetail,
    initCustomEvent: null,
  };

  const activeTool = getActiveToolForNamedEvent('wheel', event);
  if (activeTool) {
    if (!activeTool.mouseWheelCallback) {
      throw new Error(`Tool ${activeTool.toolName} missing mouseWheelCallback`);
    }
    activeTool.mouseWheelCallback(eventDetail);
  } else {
    // TODO - deprecate this handling entirely in favour of the active handling
    triggerEvent(element, Events.MOUSE_WHEEL, eventDetail);
  }
}

export default wheelListener;
