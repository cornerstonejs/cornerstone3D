import VtkjsToolsEvents from '../../enums/VtkjsToolsEvents';
import mouseMoveListener from './mouseMoveListener';
import triggerEvent from './../../util/triggerEvent';
import {
  ICornerstoneToolsEventDetail,
  IPoints,
  IPoint,
  I3dPoint,
} from '../ICornerstoneToolsEventDetail';
// ~~ VIEWPORT LIBRARY
import { getEnabledElement } from './../../../index';
import getMouseEventPoints from './getMouseEventPoints';

const { MOUSE_DOWN, MOUSE_DOWN_ACTIVATE } = VtkjsToolsEvents;

interface IMouseDownListenerState {
  renderingEngingUID: string;
  sceneUID: string;
  viewportUID: string;
  isClickEvent: boolean;
  clickDelay: number;
  preventClickTimeout: ReturnType<typeof setTimeout>;
  element: HTMLElement;
  startPoints: IPoints;
  lastPoints: IPoints;
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
    page: [0,0],
    client: [0,0],
    canvas: [0,0],
    world: [0,0,0],
  },
  lastPoints: {
    page: [0,0],
    client: [0,0],
    canvas: [0,0],
    world: [0,0,0]
  },
};

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
    page: [0,0],
    client: [0,0],
    canvas: [0,0],
    world: [0,0,0],
  },
  lastPoints: {
    page: [0,0],
    client: [0,0],
    canvas: [0,0],
    world: [0,0,0]
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
  state.element = evt.target as HTMLElement;

  const enabledElement = getEnabledElement(state.element);
  const { renderingEngineUID, sceneUID, viewportUID } = enabledElement;

  state.renderingEngingUID = renderingEngineUID;
  state.sceneUID = sceneUID;
  state.viewportUID = viewportUID;

  state.preventClickTimeout = setTimeout(
    _preventClickHandler,
    state.clickDelay
  );

  // Prevent CornerstoneToolsMouseMove while mouse is down
  state.element.removeEventListener('mousemove', mouseMoveListener);

  const startPoints = getMouseEventPoints(evt, state.element);
  const deltaPoints = _getDeltaPoints(startPoints, startPoints);

  const eventData: ICornerstoneToolsEventDetail = {
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
    eventName: MOUSE_DOWN,
  };

  state.startPoints = _copyPoints(eventData.startPoints);
  state.lastPoints = _copyPoints(eventData.lastPoints);

  const eventDidPropagate = triggerEvent(
    eventData.element,
    MOUSE_DOWN,
    eventData
  );

  if (eventDidPropagate) {
    // No tools responded to this event, create a new tool
    eventData.eventName = MOUSE_DOWN_ACTIVATE;
    triggerEvent(eventData.element, MOUSE_DOWN_ACTIVATE, eventData);
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
  const currentPoints = getMouseEventPoints(evt, state.element);
  const lastPoints = _updateMouseEventsLastPoints(
    state.element,
    state.lastPoints
  );

  const deltaPoints = _getDeltaPoints(currentPoints, lastPoints);

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

  const currentPoints = getMouseEventPoints(evt, state.element);
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

function _copyPoints(points: IPoints): IPoints {
  return <IPoints>JSON.parse(JSON.stringify(points));
}

function _subtractPoints(lhs: IPoint, rhs: IPoint): IPoint {
  return <IPoint>[lhs[0] - rhs[0], lhs[1] - rhs[1]];


}

function _subtract3dPoints(lhs: I3dPoint, rhs: I3dPoint): I3dPoint {
  return <I3dPoint>[lhs[0] - rhs[0], lhs[1] - rhs[1], lhs[2] - rhs[2]];
}

// We need to find these again because the "frame" may have changed since
// the last event (Re: pan)
function _updateMouseEventsLastPoints(element: HTMLElement, lastPoints) {
  const canvas = element;
  const enabledElement = getEnabledElement(canvas);
  // Need to update the world point to be calculated from the current reference frame,
  // Which might have changed since the last interaction.
  const world = enabledElement.viewport.canvasToWorld(lastPoints.canvas);

  return {
    page: lastPoints.page,
    client: lastPoints.client,
    canvas: lastPoints.canvas,
    world,
  };
}

function _getDeltaPoints(currentPoints: IPoints, lastPoints: IPoints): IPoints {
  return {
    page: _subtractPoints(currentPoints.page, lastPoints.page),
    client: _subtractPoints(currentPoints.client, lastPoints.client),
    canvas: _subtractPoints(currentPoints.canvas, lastPoints.canvas),
    world: _subtract3dPoints(currentPoints.world, lastPoints.world),
  };
}

export default mouseDownListener;
