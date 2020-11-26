import VtkjsToolsEvents from './../../VtkjsToolsEvents';
import mouseMoveListener from './mouseMoveListener';
import triggerEvent from './../../util/triggerEvent';

// STATE
const defaultState = {
  isClickEvent: true,
  clickDelay: 200,
  preventClickTimeout: null,
  startPoints: {},
  lastPoints: {},
};

let state = {
  isClickEvent: true,
  clickDelay: 200,
  element: null,
  preventClickTimeout: null,
  startPoints: {},
  lastPoints: {},
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
  state.element = evt.currentTarget;

  state.preventClickTimeout = setTimeout(
    _preventClickHandler,
    state.clickDelay
  );

  // Prevent CornerstoneToolsMouseMove while mouse is down
  state.element.removeEventListener('mousemove', mouseMoveListener);

  const startPoints = {
    // page: external.cornerstoneMath.point.pageToPoint(e),
    // image: external.cornerstone.pageToPixel(element, e.pageX, e.pageY),
    // canvas: external.cornerstone.pixelToCanvas(element,startPoints.image)
    client: {
      x: evt.clientX,
      y: evt.clientY,
    },
  };
  const eventData = {
    event: evt,
    // @NOTE: This has shifted to "camera"
    // viewport: external.cornerstone.getViewport(element),
    camera: {},
    element: state.element,
    startPoints,
    lastPoints: startPoints,
    currentPoints: startPoints,
    deltaPoints: { x: 0, y: 0 },
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
  const currentPoints = {
    // page: external.cornerstoneMath.point.pageToPoint(e),
    // image: external.cornerstone.pageToPixel(element, e.pageX, e.pageY),
    // canvas: external.cornerstone.pixelToCanvas(element,startPoints.image)
    client: {
      x: evt.clientX,
      y: evt.clientY,
    },
  };

  // Calculate delta values in page and image coordinates
  const deltaPoints = {
    // distance between currentPoints and lastPoints (x,y)
    // page: external.cornerstoneMath.point.subtract(currentPoints.page, lastPoints.page),
  };

  const eventData = {
    event: evt,
    camera: {},
    element: state.element,
    startPoints: _copyPoints(state.startPoints),
    lastPoints: _copyPoints(state.lastPoints),
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

  // Calculate our current points in page and image coordinates
  const currentPoints = {
    // page: external.cornerstoneMath.point.pageToPoint(e),
    // image: external.cornerstone.pageToPixel(element, e.pageX, e.pageY),
    // canvas: external.cornerstone.pixelToCanvas(element,startPoints.image)
    client: {
      x: evt.clientX,
      y: evt.clientY,
    },
  };

  // Calculate delta values in page and image coordinates
  const deltaPoints = {
    // distance between currentPoints and lastPoints (x,y)
    // page: external.cornerstoneMath.point.subtract(currentPoints.page, lastPoints.page),
  };

  const eventData = {
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

function _copyPoints(points) {
  return {
    client: {
      x: points.x,
      y: points.y,
    },
  };
}

export default mouseDownListener;
