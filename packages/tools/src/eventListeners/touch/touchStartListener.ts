import { getEnabledElement, triggerEvent } from '@cornerstonejs/core';
import Events from '../../enums/Events';
import { Swipe } from '../../enums/Touch';

import { EventTypes, ITouchPoints, IPoints, IDistance } from '../../types';

import getTouchEventPoints from './getTouchEventPoints';
import {
  copyPoints,
  copyPointsList,
  getDeltaDistanceBetweenIPoints,
  getDeltaDistance,
  getDeltaPoints,
  getMeanTouchPoints,
  // getRotation
} from '../../utilities/touch';
import { Settings } from '@cornerstonejs/core';

const runtimeSettings = Settings.getRuntimeSettings();

const {
  TOUCH_START,
  TOUCH_START_ACTIVATE,
  TOUCH_PRESS,
  TOUCH_DRAG,
  TOUCH_END,
  TOUCH_TAP,
  TOUCH_SWIPE,
} = Events;

interface ITouchTapListnenerState {
  element: HTMLDivElement;
  renderingEngineId: string;
  viewportId: string;
  startPointsList: ITouchPoints[];
  tapMaxDistance: number;
  tapTimeout: ReturnType<typeof setTimeout>;
  taps: number;
  tapToleranceMs: number;
}

interface ITouchStartListenerState {
  element: HTMLDivElement;
  renderingEngineId: string;
  viewportId: string;
  startPointsList: ITouchPoints[];
  lastPointsList: ITouchPoints[];

  // only trigger one touch event in the case the user puts down multiple fingers
  isTouchStart: boolean;
  startTime: Date;

  // handle long press
  pressTimeout: ReturnType<typeof setTimeout>;
  pressDelay: number;
  pressMaxDistance: number;
  accumulatedDistance: IDistance;

  // handle swipes
  swipeDistanceThreshold: number;
  swiped: boolean;
  swipeToleranceMs: number;
}

const zeroIPoint: IPoints = {
  page: [0, 0],
  client: [0, 0],
  canvas: [0, 0],
  world: [0, 0, 0],
};

const zeroIDistance: IDistance = {
  page: 0,
  client: 0,
  canvas: 0,
  world: 0,
};

// STATE
const defaultState: ITouchStartListenerState = {
  renderingEngineId: undefined,
  viewportId: undefined,
  element: null,
  startPointsList: [
    {
      ...zeroIPoint,
      touch: null,
    },
  ],
  lastPointsList: [
    {
      ...zeroIPoint,
      touch: null,
    },
  ],
  isTouchStart: false,
  startTime: null,

  pressTimeout: null,
  pressDelay: 700,
  pressMaxDistance: 5,
  accumulatedDistance: zeroIDistance,

  swipeDistanceThreshold: 48,
  swiped: false,
  swipeToleranceMs: 300, // user has 300ms to swipe after touch start or no swipe will trigger
};

// TODO: these values should be configurable to handle different use cases such
// as pen, left/right handed, index finger vs thumb, etc. These current values
// assume thumb usage for single finger and index/middle finger for two finger
// gestures in an attempt to cover the 90% use case.
const defaultTapState: ITouchTapListnenerState = {
  renderingEngineId: undefined,
  viewportId: undefined,
  element: null,
  startPointsList: [
    {
      ...zeroIPoint,
      touch: null,
    },
  ],
  taps: 0,
  tapTimeout: null,
  tapMaxDistance: 24,
  tapToleranceMs: 300,
};

let state: ITouchStartListenerState = JSON.parse(JSON.stringify(defaultState));
let tapState: ITouchTapListnenerState = JSON.parse(
  JSON.stringify(defaultTapState)
);

function triggerEventCallback(ele, name, eventDetail) {
  if (runtimeSettings.get('debug')) {
    if (name === 'CORNERSTONE_TOOLS_TOUCH_DRAG') {
      console.debug(name);
    } else {
      console.debug(name, eventDetail);
    }
  }
  return triggerEvent(ele, name, eventDetail);
}

/**
 * Listens to touch events from the DOM (touchstart, touchmove, touchend)
 * and depending on interaction and further interaction can emit the
 * following touch events:
 *
 * - TOUCH_START
 * - TOUCH_START_ACTIVATE
 * - TOUCH_PRESS
 * - TOUCH_DRAG (move while down)
 * - TOUCH_SWIPE
 * - TOUCH_END (also an end for multi touch)
 *
 * - TOUCH_TAP
 *
 * @param evt - The Touch event (touchstart).
 * @private
 */
function touchStartListener(evt: TouchEvent) {
  // if a user adds an extra finger when a touch/multi touch has already started
  // don't trigger another touch.
  state.element = <HTMLDivElement>evt.currentTarget;
  const enabledElement = getEnabledElement(state.element);
  const { renderingEngineId, viewportId } = enabledElement;
  state.renderingEngineId = renderingEngineId;
  state.viewportId = viewportId;
  // this prevents multiple start firing
  if (state.isTouchStart) return;
  // this will clear on touchstart and touchend
  clearTimeout(state.pressTimeout);
  state.pressTimeout = setTimeout(() => _onTouchPress(evt), state.pressDelay);

  _onTouchStart(evt);
  document.addEventListener('touchmove', _onTouchDrag); // also checks for swipe
  document.addEventListener('touchend', _onTouchEnd); // also checks for tap
}

/**
 * _onTouchPress - Handle emission of touchstart events which are held down for a longer
 * period of time
 *
 * @private
 * @param evt - The touch event (touchstart)
 */
function _onTouchPress(evt: TouchEvent) {
  const totalDistance = state.accumulatedDistance.canvas;
  if (totalDistance > state.pressMaxDistance) return;
  const eventDetail: EventTypes.TouchPressEventDetail = {
    event: evt, // touchstart native event
    eventName: TOUCH_PRESS,
    renderingEngineId: state.renderingEngineId,
    viewportId: state.viewportId,
    camera: {},
    element: state.element,
    startPointsList: copyPointsList(state.startPointsList),
    lastPointsList: copyPointsList(state.lastPointsList),
    startPoints: copyPoints(getMeanTouchPoints(state.startPointsList)),
    lastPoints: copyPoints(getMeanTouchPoints(state.lastPointsList)),
  };
  triggerEventCallback(eventDetail.element, TOUCH_PRESS, eventDetail);
}

/**
 * _onTouchStart - Handle emission of touchstart events.
 *
 * @private
 * @param evt - The touch event (touchstart)
 */
function _onTouchStart(evt: TouchEvent) {
  state.isTouchStart = true;
  state.startTime = new Date();
  const startPointsList = getTouchEventPoints(evt, state.element);
  const startPoints = getMeanTouchPoints(startPointsList);
  const deltaPoints = zeroIPoint;
  const deltaDistance = zeroIDistance;
  // deltaRotation same as deltaDistance but values are theta
  const eventDetail: EventTypes.TouchStartEventDetail = {
    event: evt,
    eventName: TOUCH_START,
    element: state.element,
    renderingEngineId: state.renderingEngineId,
    viewportId: state.viewportId,
    camera: {},
    startPointsList: startPointsList,
    lastPointsList: startPointsList,
    currentPointsList: startPointsList,
    startPoints: startPoints,
    lastPoints: startPoints,
    currentPoints: startPoints,
    deltaPoints,
    deltaDistance,
    // deltaRotation
  };

  state.startPointsList = copyPointsList(eventDetail.startPointsList);
  state.lastPointsList = copyPointsList(eventDetail.lastPointsList);
  // by triggering TOUCH_START it checks if this is toolSelection, handle modification etc.
  // of already existing tools
  const eventDidPropagate = triggerEventCallback(
    eventDetail.element,
    TOUCH_START,
    eventDetail
  );

  // if no tools responded to this event and prevented its default propagation behavior,
  // create a new tool
  if (eventDidPropagate) {
    triggerEventCallback(
      eventDetail.element,
      TOUCH_START_ACTIVATE,
      eventDetail
    );
  }
}

/**
 * _onTouchDrag - Handle emission of drag events whilst the touch is depressed.
 *
 * @private
 * @param evt - The touch event (touchmove)
 */
function _onTouchDrag(evt: TouchEvent) {
  const currentPointsList = getTouchEventPoints(evt, state.element);
  const lastPointsList = _updateTouchEventsLastPoints(
    state.element,
    state.lastPointsList
  );

  const deltaPoints =
    currentPointsList.length === lastPointsList.length
      ? getDeltaPoints(currentPointsList, lastPointsList)
      : zeroIPoint;

  const deltaDistance =
    currentPointsList.length === lastPointsList.length
      ? getDeltaDistanceBetweenIPoints(currentPointsList, lastPointsList)
      : zeroIDistance;

  const totalDistance =
    currentPointsList.length === lastPointsList.length
      ? getDeltaDistance(currentPointsList, state.lastPointsList)
      : zeroIDistance;

  state.accumulatedDistance = {
    page: state.accumulatedDistance.page + totalDistance.page,
    client: state.accumulatedDistance.client + totalDistance.client,
    canvas: state.accumulatedDistance.canvas + totalDistance.canvas,
    world: state.accumulatedDistance.world + totalDistance.world,
  };

  /**
   * this is can be uncommented to make dragging smoother. In the future, these values
   * should be in a configuration file. There may also need to be different
   * profiles for left handed and right handed thumb use. These values
   * are currently optimized for left handed use.
   *
   * const clamp = (num) => Math.min(Math.max(num, -15), 10);
   * const deltaDistanceClamped = \{
   *     page: clamp(deltaDistance.page),
   *     client: clamp(deltaDistance.client),
   *     canvas: clamp(deltaDistance.canvas),
   *     world: clamp(deltaDistance.world),
   * \};
   */

  const eventDetail: EventTypes.TouchDragEventDetail = {
    event: evt,
    eventName: TOUCH_DRAG,
    renderingEngineId: state.renderingEngineId,
    viewportId: state.viewportId,
    camera: {},
    element: state.element,
    startPoints: getMeanTouchPoints(state.startPointsList),
    lastPoints: getMeanTouchPoints(lastPointsList),
    currentPoints: getMeanTouchPoints(currentPointsList),
    startPointsList: copyPointsList(state.startPointsList),
    lastPointsList: copyPointsList(lastPointsList),
    currentPointsList,
    deltaPoints: deltaPoints,
    deltaDistance: deltaDistance,
  };

  triggerEventCallback(state.element, TOUCH_DRAG, eventDetail);

  // check for swipe events
  _checkTouchSwipe(evt, deltaPoints);

  // Update the last points
  state.lastPointsList = copyPointsList(currentPointsList);
}

/**
 * _onTouchEnd - Handle emission of touch end events
 *
 * @private
 * @param evt - The touch event.
 */
function _onTouchEnd(evt: TouchEvent): void {
  // in case it was a tap event we don't want to fire the cornerstone normalized
  // touch end event if the touch start never happend
  clearTimeout(state.pressTimeout);
  const currentPointsList = getTouchEventPoints(evt, state.element);
  const lastPointsList = _updateTouchEventsLastPoints(
    state.element,
    state.lastPointsList
  );
  const deltaPoints =
    currentPointsList.length === lastPointsList.length
      ? getDeltaPoints(currentPointsList, lastPointsList)
      : getDeltaPoints(currentPointsList, currentPointsList);
  const deltaDistance =
    currentPointsList.length === lastPointsList.length
      ? getDeltaDistanceBetweenIPoints(currentPointsList, lastPointsList)
      : getDeltaDistanceBetweenIPoints(currentPointsList, currentPointsList);
  const eventDetail: EventTypes.TouchEndEventDetail = {
    event: evt,
    eventName: TOUCH_END,
    element: state.element,
    renderingEngineId: state.renderingEngineId,
    viewportId: state.viewportId,
    camera: {},
    startPointsList: copyPointsList(state.startPointsList),
    lastPointsList: copyPointsList(lastPointsList),
    currentPointsList,
    startPoints: getMeanTouchPoints(state.startPointsList),
    lastPoints: getMeanTouchPoints(lastPointsList),
    currentPoints: getMeanTouchPoints(currentPointsList),
    deltaPoints,
    deltaDistance,
  };

  triggerEventCallback(eventDetail.element, TOUCH_END, eventDetail);
  _checkTouchTap(evt);

  // reset to default state
  state = JSON.parse(JSON.stringify(defaultState));
  document.removeEventListener('touchmove', _onTouchDrag);
  document.removeEventListener('touchend', _onTouchEnd);
}

function _checkTouchTap(evt: TouchEvent): void {
  const currentTime = new Date().getTime();
  const startTime = state.startTime.getTime();
  if (currentTime - startTime > tapState.tapToleranceMs) return;

  // first tap, initialize the state
  if (tapState.taps === 0) {
    tapState.element = state.element;
    tapState.renderingEngineId = state.renderingEngineId;
    tapState.viewportId = state.viewportId;
    tapState.startPointsList = state.startPointsList;
  }

  // subsequent tap is on a different element
  if (
    tapState.taps > 0 &&
    !(
      tapState.element == state.element &&
      tapState.renderingEngineId == state.renderingEngineId &&
      tapState.viewportId == state.viewportId
    )
  ) {
    return;
  }

  const currentPointsList = getTouchEventPoints(evt, tapState.element);
  const distanceFromStart = getDeltaDistance(
    currentPointsList,
    tapState.startPointsList
  ).canvas;

  // if the tap is too far from starting tap, we can ignore it.
  // TODO: in the case the user means to tap in two separate areas within the
  // tapTolerance (300ms), the second tap will not trigger. This is because it
  // is ignored below for simplicity to track multiple taps (double, triple etc)
  // in order to support two separate single taps that occur < 300ms on the
  // screen. One can create the concept of "TapChains". Our current implementation
  // only supports a single tap chain on the screen. You can think of it as a
  // region where the user has the option to perform unlimited multitaps as long
  // as they are < the tapToleranceMs value. So a tap somewhere else on the screen
  // that is > the tapMaxDistance will start a separate and new "TapChain".
  if (distanceFromStart > tapState.tapMaxDistance) return;

  clearTimeout(tapState.tapTimeout);
  tapState.taps += 1;

  tapState.tapTimeout = setTimeout(() => {
    const eventDetail: EventTypes.TouchTapEventDetail = {
      event: evt,
      eventName: TOUCH_TAP,
      element: tapState.element,
      renderingEngineId: tapState.renderingEngineId,
      viewportId: tapState.viewportId,
      camera: {},
      currentPointsList,
      currentPoints: getMeanTouchPoints(currentPointsList),
      taps: tapState.taps,
    };
    triggerEventCallback(eventDetail.element, TOUCH_TAP, eventDetail);
    tapState = JSON.parse(JSON.stringify(defaultTapState));
  }, tapState.tapToleranceMs);
}

function _checkTouchSwipe(evt: TouchEvent, deltaPoints: IPoints) {
  const currentTime = new Date().getTime();
  const startTime = state.startTime.getTime();
  if (state.swiped || currentTime - startTime > state.swipeToleranceMs) return;
  const [x, y] = deltaPoints.canvas;
  const eventDetail: EventTypes.TouchSwipeEventDetail = {
    event: evt,
    eventName: TOUCH_SWIPE,
    renderingEngineId: state.renderingEngineId,
    viewportId: state.viewportId,
    camera: {},
    element: state.element,
    swipe: null,
  };
  if (Math.abs(x) > state.swipeDistanceThreshold) {
    eventDetail.swipe = x > 0 ? Swipe.RIGHT : Swipe.LEFT;
    triggerEventCallback(eventDetail.element, TOUCH_SWIPE, eventDetail);
    state.swiped = true;
  }

  if (Math.abs(y) > state.swipeDistanceThreshold) {
    eventDetail.swipe = y > 0 ? Swipe.DOWN : Swipe.UP;
    triggerEventCallback(eventDetail.element, TOUCH_SWIPE, eventDetail);
    state.swiped = true;
  }
}

/**
 * Recalculates the last world coordinate, as the linear transform from client
 * to world could be different if the camera was updated.
 * @param element - The HTML element
 * @param lastPoints - The last points
 */
function _updateTouchEventsLastPoints(
  element: HTMLDivElement,
  lastPoints: ITouchPoints[]
): ITouchPoints[] {
  const { viewport } = getEnabledElement(element);
  // Need to update the world point to be calculated from the current reference frame,
  // Which might have changed since the last interaction.
  return lastPoints.map((lp) => {
    const world = viewport.canvasToWorld(lp.canvas);
    return {
      page: lp.page,
      client: lp.client,
      canvas: lp.canvas,
      world,
      touch: lp.touch,
    };
  });
}

export default touchStartListener;
