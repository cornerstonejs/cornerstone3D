import { getEnabledElement } from '@cornerstone'
import { IPoints, Point2 } from '../../types'

/**
 * getMouseEventPoints - Given a native mouse event, get the associated
 * cornerstone3D enabled element and derive a set of coordinates useful for tools.
 * @param {MouseEvent }evt The Mouse event.
 * @param {HTMLElement} element
 * @returns {IPoints} The points related to the event.
 */
export default function getMouseEventPoints(
  evt: MouseEvent,
  element?: HTMLElement
): IPoints {
  const canvas = element || (evt.target as HTMLElement)
  const enabledElement = getEnabledElement(canvas)
  const pagePoint = _pageToPoint(evt)
  const canvasPoint = _pagePointsToCanvasPoints(<HTMLElement>canvas, pagePoint)
  const worldPoint = enabledElement.viewport.canvasToWorld(canvasPoint)

  return {
    page: pagePoint,
    client: _clientToPoint(evt),
    canvas: canvasPoint,
    world: worldPoint,
  }
}

/**
 * _pagePointsToCanvasPoints - Converts point from page coordinates to canvas coordinates.
 * @param {HTMLElement} DomCanvasElement
 * @param {IPoint} pagePoint
 *
 * @returns {IPoint} The canvas coordinate points in `IPoint` format.
 */
function _pagePointsToCanvasPoints(
  DomCanvasElement: HTMLElement,
  pagePoint: Point2
) {
  const rect = DomCanvasElement.getBoundingClientRect()
  return <Point2>[
    pagePoint[0] - rect.left - window.pageXOffset,
    pagePoint[1] - rect.top - window.pageYOffset,
  ]
}

/**
 * _pageToPoint - Converts the event's `pageX` and `pageY` properties to an `IPoint`
 * coordinate.
 * @param {MouseEvent} evt The Mouse `Event`
 */
function _pageToPoint(evt: MouseEvent): Point2 {
  return <Point2>[evt.pageX, evt.pageY]
}

/**
 * _pageToPoint - Converts the event's `clientX` and `clientY` properties to an `IPoint`
 * coordinate.
 * @param {MouseEvent} evt The Mouse `Event`
 */
function _clientToPoint(evt: MouseEvent): Point2 {
  return <Point2>[evt.clientX, evt.clientY]
}
