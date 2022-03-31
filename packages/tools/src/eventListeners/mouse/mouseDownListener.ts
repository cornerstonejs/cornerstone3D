import { getEnabledElement, triggerEvent } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import Events from '../../enums/Events';
import mouseMoveListener from './mouseMoveListener';
import { EventTypes, IPoints } from '../../types';
import getMouseEventPoints from './getMouseEventPoints';

const { MOUSE_DOWN, MOUSE_DOWN_ACTIVATE, MOUSE_CLICK, MOUSE_UP, MOUSE_DRAG } =
  Events;

interface IMouseDownListenerState {
  mouseButton: number;
  element: HTMLDivElement;
  renderingEngineId: string;
  viewportId: string;
  isClickEvent: boolean;
  clickDelay: number;
  preventClickTimeout: ReturnType<typeof setTimeout>;
  startPoints: IPoints;
  lastPoints: IPoints;
}

// STATE
const defaultState: IMouseDownListenerState = {
  mouseButton: undefined,
  //
  element: null,
  renderingEngineId: undefined,
  viewportId: undefined,
  //
  isClickEvent: true,
  clickDelay: 200,
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
};

let state: IMouseDownListenerState = {
  mouseButton: undefined,
  //
  renderingEngineId: undefined,
  viewportId: undefined,
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
};

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
  state.element = <HTMLDivElement>evt.currentTarget;

  state.mouseButton = evt.button;

  const enabledElement = getEnabledElement(state.element);
  const { renderingEngineId, viewportId } = enabledElement;

  state.renderingEngineId = renderingEngineId;
  state.viewportId = viewportId;

  state.preventClickTimeout = setTimeout(
    _preventClickHandler,
    state.clickDelay
  );

  // Prevent CornerstoneToolsMouseMove while mouse is down
  state.element.removeEventListener('mousemove', mouseMoveListener);

  const startPoints = getMouseEventPoints(evt, state.element);
  const deltaPoints = _getDeltaPoints(startPoints, startPoints);

  const eventDetail: EventTypes.MouseDownEventDetail = {
    event: evt,
    eventName: MOUSE_DOWN,
    element: state.element,
    mouseButton: state.mouseButton,
    renderingEngineId: state.renderingEngineId,
    viewportId: state.viewportId,
    camera: {},
    startPoints,
    lastPoints: startPoints,
    currentPoints: startPoints,
    deltaPoints,
  };

  state.startPoints = _copyPoints(eventDetail.startPoints);
  state.lastPoints = _copyPoints(eventDetail.lastPoints);

  // by triggering MOUSE_DOWN it checks if this is toolSelection, handle modification etc.
  // of already existing tools
  const eventDidPropagate = triggerEvent(
    eventDetail.element,
    MOUSE_DOWN,
    eventDetail
  );

  // if no tools responded to this event and prevented its default propagation behavior,
  // create a new tool
  if (eventDidPropagate) {
    triggerEvent(eventDetail.element, MOUSE_DOWN_ACTIVATE, eventDetail);
  }

  document.addEventListener('mousemove', _onMouseDrag);
  document.addEventListener('mouseup', _onMouseUp);
}

/**
 *_onMouseDrag - Handle emission of drag events whilst the mouse is depressed.
 *
 * @private
 * @param evt - The mouse event.
 */
function _onMouseDrag(evt: MouseEvent) {
  const currentPoints = getMouseEventPoints(evt, state.element);
  const lastPoints = _updateMouseEventsLastPoints(
    state.element,
    state.lastPoints
  );

  const deltaPoints = _getDeltaPoints(currentPoints, lastPoints);

  const eventDetail: EventTypes.MouseDragEventDetail = {
    event: evt,
    eventName: MOUSE_DRAG,
    mouseButton: state.mouseButton,
    renderingEngineId: state.renderingEngineId,
    viewportId: state.viewportId,
    camera: {},
    element: state.element,
    startPoints: _copyPoints(state.startPoints),
    lastPoints: _copyPoints(lastPoints),
    currentPoints,
    deltaPoints,
  };

  triggerEvent(state.element, MOUSE_DRAG, eventDetail);

  // Update the last points
  state.lastPoints = _copyPoints(currentPoints);
}

/**
 *_onMouseDrag - Handle emission of mouse up events, and re-enabling mouse move events.
 *
 * @private
 * @param evt - The mouse event.
 */
function _onMouseUp(evt: MouseEvent): void {
  // Cancel the timeout preventing the click event from triggering
  clearTimeout(state.preventClickTimeout);

  const eventName = state.isClickEvent ? MOUSE_CLICK : MOUSE_UP;

  const currentPoints = getMouseEventPoints(evt, state.element);
  const deltaPoints = _getDeltaPoints(currentPoints, state.lastPoints);
  const eventDetail:
    | EventTypes.MouseUpEventDetail
    | EventTypes.MouseClickEventType = {
    event: evt,
    eventName,
    mouseButton: state.mouseButton,
    element: state.element,
    renderingEngineId: state.renderingEngineId,
    viewportId: state.viewportId,
    camera: {},
    startPoints: _copyPoints(state.startPoints),
    lastPoints: _copyPoints(state.lastPoints),
    currentPoints,
    deltaPoints,
  };

  triggerEvent(eventDetail.element, eventName, eventDetail);

  // Remove our temporary handlers
  document.removeEventListener('mousemove', _onMouseDrag);
  document.removeEventListener('mouseup', _onMouseUp);

  // Restore our global mousemove listener
  state.element.addEventListener('mousemove', mouseMoveListener);

  // Restore `state` to `defaultState`
  state = JSON.parse(JSON.stringify(defaultState));
}

function _preventClickHandler() {
  state.isClickEvent = false;
}

/**
 * Copies a set of points.
 * @param points - The `IPoints` instance to copy.
 *
 * @returns A copy of the points.
 */
function _copyPoints(points: IPoints): IPoints {
  return JSON.parse(JSON.stringify(points));
}

/**
 * Recalculates the last world coordinate, as the linear transform from client
 * to world could be different if the camera was updated.
 * @param element - The HTML element
 * @param lastPoints - The last points
 */
function _updateMouseEventsLastPoints(
  element: HTMLDivElement,
  lastPoints: IPoints
): IPoints {
  const { viewport } = getEnabledElement(element);
  // Need to update the world point to be calculated from the current reference frame,
  // Which might have changed since the last interaction.
  const world = viewport.canvasToWorld(lastPoints.canvas);

  return {
    page: lastPoints.page,
    client: lastPoints.client,
    canvas: lastPoints.canvas,
    world,
  };
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
  };
}

/**
 * _subtractPoints - Subtracts `point1` from `point0`.
 * @param point0 - The first point.
 * @param point1 - The second point to subtract from the first.
 *
 * @returns The difference.
 */
function _subtractPoints2D(
  point0: Types.Point2,
  point1: Types.Point2
): Types.Point2 {
  return [point0[0] - point1[0], point0[1] - point1[1]];
}

function _subtractPoints3D(
  point0: Types.Point3,
  point1: Types.Point3
): Types.Point3 {
  return [point0[0] - point1[0], point0[1] - point1[1], point0[2] - point1[2]];
}

export function getMouseButton(): number {
  return state.mouseButton;
}

export default mouseDownListener;
