import normalizeWheel from './_normalizeWheel';
import VtkjsToolsEvents from '../../enums/VtkjsToolsEvents';
import triggerEvent from './../../util/triggerEvent';
import { IPoints, IPoint } from './../ICornerstoneToolsEventDetail';
// ~~ VIEWPORT LIBRARY
import { getEnabledElement } from './../../../index';

/**
 *
 * @private
 * @function wheelEventHandler
 * @param {WheelEvent} evt
 * @returns {undefined}
 */
function wheelListener(evt: WheelEvent) {
  const element = evt.currentTarget;

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
    points: _getWheelEventPoints(evt),
  };

  triggerEvent(element, VtkjsToolsEvents.MOUSE_WHEEL, eventData);
}

// TODO: ------ DUPLICATED IN `mouseDownListener`
function _getWheelEventPoints(evt: WheelEvent): IPoints {
  const canvas = evt.target;
  const enabledElement = getEnabledElement(canvas);
  const pagePoint = _pageToPoint(evt);
  const canvasPoint = _pagePointsToCanvasPoints(
    canvas as HTMLElement,
    pagePoint
  );
  const [x, y, z] = enabledElement.viewport.canvasToWorld([
    canvasPoint.x,
    canvasPoint.y,
  ]);
  const worldPoint = { x, y, z };

  return {
    page: pagePoint,
    client: _clientToPoint(evt),
    canvas: canvasPoint,
    world: worldPoint,
  };
}

function _pageToPoint(evt: MouseEvent): IPoint {
  return {
    x: evt.pageX,
    y: evt.pageY,
  };
}

function _clientToPoint(evt: MouseEvent): IPoint {
  return {
    x: evt.clientX,
    y: evt.clientY,
  };
}

function _pagePointsToCanvasPoints(
  DomCanvasElement: HTMLElement,
  pagePoint: IPoint
) {
  const rect = DomCanvasElement.getBoundingClientRect();
  return {
    x: pagePoint.x - rect.left - window.pageXOffset,
    y: pagePoint.y - rect.top - window.pageYOffset,
  };
}

export default wheelListener;
