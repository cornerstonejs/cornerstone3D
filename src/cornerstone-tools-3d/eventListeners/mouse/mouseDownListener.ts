// @ts-ignore
import VtkjsToolsEvents from '../../enums/VtkjsToolsEvents.ts';
// @ts-ignore
import mouseMoveListener from './mouseMoveListener.ts';
// @ts-ignore
import triggerEvent from './../../util/triggerEvent.ts';
// ~~ VIEWPORT LIBRARY
import { getEnabledElement } from './../../../index';

// STATE
const defaultState = {
  //
  renderingEngingUID: undefined,
  sceneUID: undefined,
  viewportUID: undefined,
  //
  isClickEvent: true,
  clickDelay: 200,
  preventClickTimeout: null,
  startPoints: {},
  lastPoints: {},
};

let state = {
  //
  renderingEngingUID: undefined,
  sceneUID: undefined,
  viewportUID: undefined,
  //
  isClickEvent: true,
  clickDelay: 200,
  element: null,
  preventClickTimeout: null,
  // --> startPoints (first event)
  // --> lastPoints (points from 'previous' event)
  // --> currentPoints (points from 'this' event)
  // --> deltaPoints (delta from current - last)
  startPoints: {},
  lastPoints: {
    // TODO write types
    world: { x: 0, y: 0, z: 0 },
    canvas: { x: 0, y: 0 },
  },
};

/**
 * Depending on interaction, capable of emitting:
 * - MOUSE_DOWN
 * - MOUSE_DOWN_ACTIVATE
 * - MOUSE_DRAG (move while down)
 * - MOUSE_UP
 * - MOUSE_CLICK
 *
 *
 * @private
 * @param evt
 */
function mouseDownListener(evt: MouseEvent): void {
  state.element = evt.target;
  const enabledElement = getEnabledElement(state.element);
  const {
    // The viewport object with helpers.
    viewport,
    // The scene object with helpers.
    scene,
    // The viewport UID.
    viewportUID,
    // The scene UID.
    sceneUID,
    // The renderingEngineUID
    renderingEngineUID,
  } = enabledElement;
  state.renderingEngingUID = renderingEngineUID;
  state.sceneUID = sceneUID;
  state.viewportUID = viewportUID;

  state.preventClickTimeout = setTimeout(
    _preventClickHandler,
    state.clickDelay
  );

  // Prevent CornerstoneToolsMouseMove while mouse is down
  state.element.removeEventListener('mousemove', mouseMoveListener);

  const startPoints = _getMouseEventPoints(evt);

  const deltaPoints = _getDeltaPoints(startPoints, startPoints);
  const eventData = {
    renderingEngineUID: state.renderingEngingUID,
    sceneUID: state.sceneUID,
    viewportUID: state.viewportUID,
    event: evt,
    // @NOTE: This has shifted to "camera"
    // viewport: external.cornerstone.getViewport(element),
    camera: {},
    element: state.element,
    startPoints,
    lastPoints: startPoints,
    currentPoints: startPoints,
    deltaPoints,
    eventName: VtkjsToolsEvents.MOUSE_DOWN,
  };

  state.startPoints = _copyPoints(eventData.startPoints);
  state.lastPoints = _copyPoints(eventData.lastPoints);

  const eventDidPropagate = triggerEvent(
    eventData.element,
    VtkjsToolsEvents.MOUSE_DOWN,
    eventData
  );

  if (eventDidPropagate) {
    // No tools responded to this event, create a new tool
    eventData.eventName = VtkjsToolsEvents.MOUSE_DOWN_ACTIVATE;
    triggerEvent(
      eventData.element,
      VtkjsToolsEvents.MOUSE_DOWN_ACTIVATE,
      eventData
    );
  }

  document.addEventListener('mousemove', _onMouseDrag);
  document.addEventListener('mouseup', _onMouseUp);
}

/**
 *
 * @private
 * @param evt
 */
function _onMouseDrag(evt: MouseEvent): void {
  const currentPoints = _getMouseEventPoints(evt);
  const lastPoints = _updateMouseEventsLastPoints(evt, state.lastPoints);
  const deltaPoints = _getDeltaPoints(currentPoints, lastPoints);

  const eventData = {
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
    eventName: VtkjsToolsEvents.MOUSE_DRAG,
  };

  triggerEvent(state.element, VtkjsToolsEvents.MOUSE_DRAG, eventData);

  // Update the last points
  state.lastPoints = _copyPoints(currentPoints);
}

/**
 *
 * @private
 * @param evt
 */
function _onMouseUp(evt: MouseEvent): void {
  // Cancel the timeout preventing the click event from triggering
  clearTimeout(state.preventClickTimeout);

  const eventName = state.isClickEvent
    ? VtkjsToolsEvents.MOUSE_CLICK
    : VtkjsToolsEvents.MOUSE_UP;

  const currentPoints = _getMouseEventPoints(evt);
  const deltaPoints = _getDeltaPoints(currentPoints, state.lastPoints);
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
  };

  triggerEvent(eventData.element, eventName, eventData);

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

interface IPoint {
  x: number;
  y: number;
}

interface I3dPoint {
  x: number;
  y: number;
  z: number;
}

function _copyPoints(points) {
  return JSON.parse(JSON.stringify(points));
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

function _subtractPoints(lhs: IPoint, rhs: IPoint): IPoint {
  return {
    x: lhs.x - rhs.x,
    y: lhs.y - rhs.y,
  };
}

function _subtract3dPoints(lhs: I3dPoint, rhs: I3dPoint): I3dPoint {
  return {
    x: lhs.x - rhs.x,
    y: lhs.y - rhs.y,
    z: lhs.z - rhs.z,
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

function _getMouseEventPoints(evt: MouseEvent) {
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
  // TODO: Need to set focal point and position.
  // TODO: Viewports other than axial don't work.
  // TODO: Up and down is inverted.

  const worldPoint = { x, y, z };

  return {
    page: pagePoint,
    client: _clientToPoint(evt),
    canvas: canvasPoint,
    world: worldPoint,
  };
}

function _updateMouseEventsLastPoints(evt: MouseEvent, lastPoints) {
  const canvas = evt.target;
  const enabledElement = getEnabledElement(canvas);
  // Need to update the world point to be calculated from the current reference frame,
  // Which might have changed since the last interaction.
  const [x, y, z] = enabledElement.viewport.canvasToWorld([
    lastPoints.canvas.x,
    lastPoints.canvas.y,
  ]);

  return {
    page: lastPoints.page,
    client: lastPoints.client,
    canvas: lastPoints.canvas,
    world: { x, y, z },
  };
}

function _getDeltaPoints(currentPoints, lastPoints) {
  const deltaPoints = {
    // current - last (csTools)
    page: _subtractPoints(currentPoints.page, lastPoints.page),
    client: _subtractPoints(currentPoints.client, lastPoints.client),
    canvas: _subtractPoints(currentPoints.canvas, lastPoints.canvas),
    world: _subtract3dPoints(currentPoints.world, lastPoints.world),

    // last - current (vtk manipulator)
    // page: _subtractPoints(lastPoints.page, currentPoints.page),
    // client: _subtractPoints(lastPoints.client, currentPoints.client),
    // canvas: _subtractPoints(lastPoints.canvas, currentPoints.canvas),
    // world: _subtract3dPoints(lastPoints.world, currentPoints.world),
  };

  // function Points (points) : void {
  //   this.page = `${points.page.x}, ${points.page.y}`;
  //   this.client = `${points.client.x}, ${points.client.y}`
  //   this.canvas = `${points.canvas.x}, ${points.canvas.y}`;
  //   this.world = `${points.world.x}, ${points.world.y}, ${points.world.z}`;
  // }

  // const stuff : any = {};
  // stuff.last = new Points(lastPoints);
  // stuff.current = new Points(currentPoints);
  // stuff.delta = new Points(deltaPoints);

  // console.table(stuff);

  return deltaPoints;
}

export default mouseDownListener;
