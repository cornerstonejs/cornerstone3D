import { getEnabledElement } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import { ITouchPoints } from '../../types';

/**
 * Given a native touch event, get the associated cornerstone3D enabled element
 * and derive a set of coordinates useful for tools.
 * @param evt - The Touch event.
 * @param element - The DOM HTMLDivElement that the event was triggered on.
 * @returns The points related to the event in the form of a `IPoints` object containing
 * the following properties: `page`, `client`, `canvas`, and `world` details of the event.
 */
export default function getTouchEventPoints(
  evt: TouchEvent,
  element?: HTMLDivElement
): ITouchPoints[] {
  const elementToUse = element || (evt.currentTarget as HTMLDivElement);
  const touches = evt.type === 'touchend' ? evt.changedTouches : evt.touches;
  return Object.keys(touches).map((i) => {
    const clientPoint = _clientToPoint(touches[i]);
    const pagePoint = _pageToPoint(touches[i]);
    const canvasPoint = _pagePointsToCanvasPoints(elementToUse, pagePoint);
    const { viewport } = getEnabledElement(elementToUse);
    const worldPoint = viewport.canvasToWorld(canvasPoint);
    return {
      page: pagePoint,
      client: clientPoint,
      canvas: canvasPoint,
      world: worldPoint,
      touch: {
        identifier: i,
        radiusX: touches[i].radiusX,
        radiusY: touches[i].radiusY,
        force: touches[i].force,
        rotationAngle: touches[i].rotationAngle,
      },
    };
  });
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
 * @param touch - The Touch
 */
function _pageToPoint(touch: Touch): Types.Point2 {
  return [touch.pageX, touch.pageY];
}

/**
 * Converts the event's `clientX` and `clientY` properties to Types.Point2 format
 * @param evt - The Touch `Event`
 */
function _clientToPoint(touch: Touch): Types.Point2 {
  return [touch.clientX, touch.clientY];
}
