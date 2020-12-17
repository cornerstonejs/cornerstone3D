import normalizeWheel from './_normalizeWheel';
import VtkjsToolsEvents from '../../enums/VtkjsToolsEvents';
import triggerEvent from './../../util/triggerEvent';
import { IPoints, IPoint } from './../ICornerstoneToolsEventDetail';
// ~~ VIEWPORT LIBRARY
import { getEnabledElement } from './../../../index';
import getMouseEventPoints from '../mouse/getMouseEventPoints'

/**
 *
 * @private
 * @function wheelEventHandler
 * @param {WheelEvent} evt
 * @returns {undefined}
 */
function wheelListener(evt: WheelEvent) {
  const element = evt.currentTarget as HTMLElement;

  const enabledElement = getEnabledElement(element);
  const { renderingEngineUID, sceneUID, viewportUID } = enabledElement;

  // Prevent triggering MouseWheel events that are not real scroll events:
  // E.g. when clicking the MiddleMouseWheelButton, a deltaY of 0 is emitted.
  // See https://github.com/cornerstonejs/cornerstoneTools/issues/935
  if (evt.deltaY > -1 && evt.deltaY < 1) {
    return;
  }

  evt.preventDefault();

  const { spinX, spinY, pixelX, pixelY } = normalizeWheel(evt);
  const direction = spinY < 0 ? -1 : 1;

  const eventData = {
    renderingEngineUID,
    sceneUID,
    viewportUID,
    element,
    camera: {},
    detail: evt,
    wheel: {
      spinX,
      spinY,
      pixelX,
      pixelY,
      direction,
    },
    points: getMouseEventPoints(evt),
  };

  triggerEvent(element, VtkjsToolsEvents.MOUSE_WHEEL, eventData);
}


export default wheelListener;
