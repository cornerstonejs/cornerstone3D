import { getEnabledElement, triggerEvent } from '@cornerstone'
import CornerstoneTools3DEvents from '../../enums/CornerstoneTools3DEvents'
import mouseMoveListener from './mouseMoveListener'
import {
  ICornerstoneToolsEventDetail,
  IPoints,
  Point2,
  Point3,
} from '../../types'
// ~~ VIEWPORT LIBRARY
import getMouseEventPoints from './getMouseEventPoints'

const { MOUSE_DOWN, MOUSE_DOWN_ACTIVATE } = CornerstoneTools3DEvents

interface IMouseDownListenerState {
  renderingEngingUID: string
  sceneUID: string
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
  renderingEngingUID: undefined,
  sceneUID: undefined,
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
  renderingEngingUID: undefined,
  sceneUID: undefined,
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
 * Listens to mouse down events and dependong on interaction and further
 * interaction can emit the following mouse events:
 *
 * - MOUSE_DOWN
 * - MOUSE_DOWN_ACTIVATE
 * - MOUSE_DRAG (move while down)
 * - MOUSE_UP
 * - MOUSE_CLICK
 *
 * @param {MouseEvent} evt The mouse event.
 */
function mouseDownListener(evt: MouseEvent) {
  state.element = <HTMLElement>evt.target

  const enabledElement = getEnabledElement(state.element)
  const { renderingEngineUID, sceneUID, viewportUID } = enabledElement

  state.renderingEngingUID = renderingEngineUID
  state.sceneUID = sceneUID
  state.viewportUID = viewportUID

  state.preventClickTimeout = setTimeout(_preventClickHandler, state.clickDelay)

  // Prevent CornerstoneToolsMouseMove while mouse is down
  state.element.removeEventListener('mousemove', mouseMoveListener)

  const startPoints = getMouseEventPoints(evt, state.element)
  const deltaPoints = _getDeltaPoints(startPoints, startPoints)

  const eventData: ICornerstoneToolsEventDetail = {
    renderingEngineUID: state.renderingEngingUID,
    sceneUID: state.sceneUID,
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

  const eventDidPropagate = triggerEvent(
    eventData.element,
    MOUSE_DOWN,
    eventData
  )

  if (eventDidPropagate) {
    // No tools responded to this event, create a new tool
    eventData.eventName = MOUSE_DOWN_ACTIVATE
    triggerEvent(eventData.element, MOUSE_DOWN_ACTIVATE, eventData)
  }

  document.addEventListener('mousemove', _onMouseDrag)
  document.addEventListener('mouseup', _onMouseUp)
}

/**
 *_onMouseDrag - Handle emission of drag events whilst the mouse is depressed.
 *
 * @private
 * @param {MouseEvent} evt The mouse event.
 */
function _onMouseDrag(evt: MouseEvent) {
  const currentPoints = getMouseEventPoints(evt, state.element)
  const lastPoints = _updateMouseEventsLastPoints(
    state.element,
    state.lastPoints
  )

  const deltaPoints = _getDeltaPoints(currentPoints, lastPoints)

  const eventData: ICornerstoneToolsEventDetail = {
    renderingEngineUID: state.renderingEngingUID,
    sceneUID: state.sceneUID,
    viewportUID: state.viewportUID,
    event: evt,
    camera: {},
    element: state.element,
    startPoints: _copyPoints(state.startPoints),
    lastPoints: _copyPoints(lastPoints),
    currentPoints,
    deltaPoints,
    eventName: CornerstoneTools3DEvents.MOUSE_DRAG,
  }

  triggerEvent(state.element, CornerstoneTools3DEvents.MOUSE_DRAG, eventData)

  // Update the last points
  state.lastPoints = _copyPoints(currentPoints)
}

/**
 *_onMouseDrag - Handle emission of mouse up events, and re-enabling mouse move events.
 *
 * @private
 * @param {MouseEvent} evt The mouse event.
 */
function _onMouseUp(evt: MouseEvent): void {
  // Cancel the timeout preventing the click event from triggering
  clearTimeout(state.preventClickTimeout)

  const eventName = state.isClickEvent
    ? CornerstoneTools3DEvents.MOUSE_CLICK
    : CornerstoneTools3DEvents.MOUSE_UP

  const currentPoints = getMouseEventPoints(evt, state.element)
  const deltaPoints = _getDeltaPoints(currentPoints, state.lastPoints)
  const eventData = {
    renderingEngineUID: state.renderingEngingUID,
    sceneUID: state.sceneUID,
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
 * _copyPoints - Copies a set of points.
 * @param {IPoints} points The `IPoints` instance to copy.
 *
 * @returns {IPoints} A copy of the points.
 */
function _copyPoints(points: IPoints): IPoints {
  return <IPoints>JSON.parse(JSON.stringify(points))
}

/**
 * _subtractPoints - Subtracts `point1` from `point0`.
 * @param {IPoint} point0 The first point.
 * @param {IPoint} point1 The second point to subtract from the first.
 *
 * @returns {IPoint} The difference.
 */
function _subtractPoints(point0: Point2, point1: Point2): Point2 {
  return <Point2>[point0[0] - point1[0], point0[1] - point1[1]]
}

function _subtract3dPoints(point0: Point3, point1: Point3): Point3 {
  return <Point3>[
    point0[0] - point1[0],
    point0[1] - point1[1],
    point0[2] - point1[2],
  ]
}

/**
 * _updateMouseEventsLastPoints - Recalculates the last world coordinate,
 * as the linear transform from client to world could be different if the camera was updated.
 * @param {HTMLElement} element
 * @param lastPoints
 */
function _updateMouseEventsLastPoints(
  element: HTMLElement,
  lastPoints: IPoints
): IPoints {
  const canvas = element
  const enabledElement = getEnabledElement(canvas)
  // Need to update the world point to be calculated from the current reference frame,
  // Which might have changed since the last interaction.
  const world = enabledElement.viewport.canvasToWorld(lastPoints.canvas)

  return {
    page: lastPoints.page,
    client: lastPoints.client,
    canvas: lastPoints.canvas,
    world,
  }
}

/**
 * _getDeltaPoints - Returns the difference bettwen two `IPoints` instances.
 * @param {IPoints} currentPoints - The current points.
 * @param {IPoints} lastPoints -- The last points, to be subtracted from the `currentPoints`.
 *
 * @returns {IPoints} The difference.
 */
function _getDeltaPoints(currentPoints: IPoints, lastPoints: IPoints): IPoints {
  return {
    page: _subtractPoints(currentPoints.page, lastPoints.page),
    client: _subtractPoints(currentPoints.client, lastPoints.client),
    canvas: _subtractPoints(currentPoints.canvas, lastPoints.canvas),
    world: _subtract3dPoints(currentPoints.world, lastPoints.world),
  }
}

export default mouseDownListener
