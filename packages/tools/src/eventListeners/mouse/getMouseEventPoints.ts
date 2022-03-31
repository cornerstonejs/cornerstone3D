import { getEnabledElement } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import { IPoints } from '../../types';

/**
 * Given a native mouse event, get the associated cornerstone3D enabled element
 * and derive a set of coordinates useful for tools.
 * @param evt - The Mouse event.
 * @param element - The DOM HTMLDivElement that the event was triggered on.
 * @returns The points related to the event in the form of a `IPoints` object containing
 * the following properties: `page`, `client`, `canvas`, and `world` details of the event.
 */
export default function getMouseEventPoints(
  evt: MouseEvent,
  element?: HTMLDivElement
): IPoints {
  const elementToUse = element || (evt.currentTarget as HTMLDivElement);
  const { viewport } = getEnabledElement(elementToUse);
  const clientPoint = _clientToPoint(evt);
  const pagePoint = _pageToPoint(evt);
  const canvasPoint = _pagePointsToCanvasPoints(elementToUse, pagePoint);
  const worldPoint = viewport.canvasToWorld(canvasPoint);

  return {
    page: pagePoint,
    client: clientPoint,
    canvas: canvasPoint,
    world: worldPoint,
  };
}

/**
 * Converts point from page coordinates to canvas coordinates.
 * @param element - HTMLDivElement
 * @param pagePoint - Point in page coordinates pageX and pageY
 *
 * @returns The canvas coordinate points
 */
function _pagePointsToCanvasPoints(
  element: HTMLDivElement,
  pagePoint: Types.Point2
): Types.Point2 {
  const rect = element.getBoundingClientRect();
  return [
    pagePoint[0] - rect.left - window.pageXOffset,
    pagePoint[1] - rect.top - window.pageYOffset,
  ];
}

/**
 * Converts the event's `pageX` and `pageY` properties to Types.Point2 format
 *
 * @param evt - The Mouse `Event`
 */
function _pageToPoint(evt: MouseEvent): Types.Point2 {
  return [evt.pageX, evt.pageY];
}

/**
 * Converts the event's `clientX` and `clientY` properties to Types.Point2 format
 * @param evt - The Mouse `Event`
 */
function _clientToPoint(evt: MouseEvent): Types.Point2 {
  return [evt.clientX, evt.clientY];
}
