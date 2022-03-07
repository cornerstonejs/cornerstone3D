import {
  getEnabledElement,
  triggerEvent,
} from '@precisionmetrics/cornerstone-render'
import CornerstoneTools3DEvents from '../../enums/CornerstoneTools3DEvents'
import mouseMoveListener from './mouseMoveListener'
import { EventsTypes, IPoints, Point2, Point3 } from '../../types'
import getMouseEventPoints from './getMouseEventPoints'

const { MOUSE_DOWN, MOUSE_DOWN_ACTIVATE, MOUSE_CLICK, MOUSE_UP, MOUSE_DRAG } =
  CornerstoneTools3DEvents

interface IMouseDownListenerState {
  renderingEngineUID: string
  viewportUID: string
  isClickEvent: boolean
  clickDelay: number
  preventClickTimeout: ReturnType<typeof setTimeout>
  element: HTMLElement
  startPoints: IPoints
  lastPoints: IPoints
}

// STATE
const defaultState: IMouseDownListenerState = {
  //
  renderingEngineUID: undefined,
  viewportUID: undefined,
  //
  isClickEvent: true,
  clickDelay: 200,
  preventClickTimeout: null,
  element: null,
  startPoints: {
    page: [0, 0],
    client: [0, 0],
    canvas: [0, 0],
    world: [0, 0, 0],
  },
  lastPoints: {
    page: [0, 0],
    client: [0, 0],
    canvas: [0, 0],
    world: [0, 0, 0],
  },
}

let state: IMouseDownListenerState = {
  //
  renderingEngineUID: undefined,
  viewportUID: undefined,
  //
  isClickEvent: true,
  clickDelay: 200,
  element: null,
  preventClickTimeout: null,
  startPoints: {
    page: [0, 0],
    client: [0, 0],
    canvas: [0, 0],
    world: [0, 0, 0],
  },
  lastPoints: {
    page: [0, 0],
    client: [0, 0],
    canvas: [0, 0],
    world: [0, 0, 0],
  },
}

/**
 * Listens to mouse down events from the DOM and depending on interaction and further
 * interaction can emit the following mouse events:
 *
 * - MOUSE_DOWN
 * - MOUSE_DOWN_ACTIVATE
 * - MOUSE_DRAG (move while down)
 * - MOUSE_UP
 * - MOUSE_CLICK
 *
 * @param evt - The Mouse event.
 * @private
 */
function mouseDownListener(evt: MouseEvent) {
  state.element = <HTMLElement>evt.currentTarget

  const enabledElement = getEnabledElement(state.element)
  const { renderingEngineUID, viewportUID } = enabledElement

  state.renderingEngineUID = renderingEngineUID
  state.viewportUID = viewportUID

  state.preventClickTimeout = setTimeout(_preventClickHandler, state.clickDelay)

  // Prevent CornerstoneToolsMouseMove while mouse is down
  state.element.removeEventListener('mousemove', mouseMoveListener)

  const startPoints = getMouseEventPoints(evt, state.element)
  const deltaPoints = _getDeltaPoints(startPoints, startPoints)

  const eventData: EventsTypes.NormalizedMouseEventData = {
    renderingEngineUID: state.renderingEngineUID,
    viewportUID: state.viewportUID,
    event: evt,
    camera: {},
    element: state.element,
    startPoints,
    lastPoints: startPoints,
    currentPoints: startPoints,
    deltaPoints,
    eventName: MOUSE_DOWN,
  }

  state.startPoints = _copyPoints(eventData.startPoints)
  state.lastPoints = _copyPoints(eventData.lastPoints)

  // by triggering MOUSE_DOWN it checks if this is toolSelection, handle modification etc.
  // of already existing tools
  const eventDidPropagate = triggerEvent(
    eventData.element,
    MOUSE_DOWN,
    eventData
  )

  // if no tools responded to this event and prevented its default propagation behavior,
  // create a new tool
  if (eventDidPropagate) {
    triggerEvent(eventData.element, MOUSE_DOWN_ACTIVATE, eventData)
  }

  document.addEventListener('mousemove', _onMouseDrag)
  document.addEventListener('mouseup', _onMouseUp)
}

/**
 *_onMouseDrag - Handle emission of drag events whilst the mouse is depressed.
 *
 * @private
 * @param evt - The mouse event.
 */
function _onMouseDrag(evt: MouseEvent) {
  const currentPoints = getMouseEventPoints(evt, state.element)
  const lastPoints = _updateMouseEventsLastPoints(
    state.element,
    state.lastPoints
  )

  const deltaPoints = _getDeltaPoints(currentPoints, lastPoints)

  const eventData: EventsTypes.NormalizedMouseEventData = {
    renderingEngineUID: state.renderingEngineUID,
    viewportUID: state.viewportUID,
    event: evt,
    camera: {},
    element: state.element,
    startPoints: _copyPoints(state.startPoints),
    lastPoints: _copyPoints(lastPoints),
    currentPoints,
    deltaPoints,
    eventName: MOUSE_DRAG,
  }

  triggerEvent(state.element, MOUSE_DRAG, eventData)

  // Update the last points
  state.lastPoints = _copyPoints(currentPoints)
}

/**
 *_onMouseDrag - Handle emission of mouse up events, and re-enabling mouse move events.
 *
 * @private
 * @param evt - The mouse event.
 */
function _onMouseUp(evt: MouseEvent): void {
  // Cancel the timeout preventing the click event from triggering
  clearTimeout(state.preventClickTimeout)

  const eventName = state.isClickEvent ? MOUSE_CLICK : MOUSE_UP

  const currentPoints = getMouseEventPoints(evt, state.element)
  const deltaPoints = _getDeltaPoints(currentPoints, state.lastPoints)
  const eventData: EventsTypes.NormalizedMouseEventData = {
    renderingEngineUID: state.renderingEngineUID,
    viewportUID: state.viewportUID,
    event: evt,
    camera: {},
    element: state.element,
    startPoints: _copyPoints(state.startPoints),
    lastPoints: _copyPoints(state.lastPoints),
    currentPoints,
    deltaPoints,
    eventName,
  }

  triggerEvent(eventData.element, eventName, eventData)

  // Remove our temporary handlers
  document.removeEventListener('mousemove', _onMouseDrag)
  document.removeEventListener('mouseup', _onMouseUp)

  // Restore our global mousemove listener
  state.element.addEventListener('mousemove', mouseMoveListener)

  // Restore `state` to `defaultState`
  state = JSON.parse(JSON.stringify(defaultState))
}

function _preventClickHandler() {
  state.isClickEvent = false
}

/**
 * Copies a set of points.
 * @param points - The `IPoints` instance to copy.
 *
 * @returns A copy of the points.
 */
function _copyPoints(points: IPoints): IPoints {
  return JSON.parse(JSON.stringify(points))
}

/**
 * Recalculates the last world coordinate, as the linear transform from client
 * to world could be different if the camera was updated.
 * @param element - The HTML element
 * @param lastPoints - The last points
 */
function _updateMouseEventsLastPoints(
  element: HTMLElement,
  lastPoints: IPoints
): IPoints {
  const { viewport } = getEnabledElement(element)
  // Need to update the world point to be calculated from the current reference frame,
  // Which might have changed since the last interaction.
  const world = viewport.canvasToWorld(lastPoints.canvas)

  return {
    page: lastPoints.page,
    client: lastPoints.client,
    canvas: lastPoints.canvas,
    world,
  }
}

/**
 * Returns the difference between two `IPoints` instances.
 * @param currentPoints - The current points.
 * @param lastPoints -- The last points, to be subtracted from the `currentPoints`.
 *
 * @returns The difference in IPoints format
 */
function _getDeltaPoints(currentPoints: IPoints, lastPoints: IPoints): IPoints {
  return {
    page: _subtractPoints2D(currentPoints.page, lastPoints.page),
    client: _subtractPoints2D(currentPoints.client, lastPoints.client),
    canvas: _subtractPoints2D(currentPoints.canvas, lastPoints.canvas),
    world: _subtractPoints3D(currentPoints.world, lastPoints.world),
  }
}

/**
 * _subtractPoints - Subtracts `point1` from `point0`.
 * @param point0 - The first point.
 * @param point1 - The second point to subtract from the first.
 *
 * @returns The difference.
 */
function _subtractPoints2D(point0: Point2, point1: Point2): Point2 {
  return [point0[0] - point1[0], point0[1] - point1[1]]
}

function _subtractPoints3D(point0: Point3, point1: Point3): Point3 {
  return [point0[0] - point1[0], point0[1] - point1[1], point0[2] - point1[2]]
}

export default mouseDownListener
