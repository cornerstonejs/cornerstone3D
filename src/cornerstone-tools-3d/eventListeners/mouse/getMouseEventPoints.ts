import { getEnabledElement } from '../../../index';
import { IPoints, IPoint } from '../ICornerstoneToolsEventDetail';

export default function getMouseEventPoints(
  evt: MouseEvent,
  element?: HTMLElement
): IPoints {
  const canvas = element || evt.target;
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
