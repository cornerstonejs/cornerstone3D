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
  const worldPoint = enabledElement.viewport.canvasToWorld(canvasPoint);

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
 return <IPoint>[
    pagePoint[0] - rect.left - window.pageXOffset,
    pagePoint[1] - rect.top - window.pageYOffset
  ]

}

function _pageToPoint(evt: MouseEvent): IPoint {
  return <IPoint>[evt.pageX, evt.pageY]

}

function _clientToPoint(evt: MouseEvent): IPoint {
  return <IPoint>[evt.clientX, evt.clientY];
}
