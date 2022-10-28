import { getEnabledElement, triggerEvent } from '@cornerstonejs/core';
import Events from '../../enums/Events';
import { Swipe } from '../../enums/Touch';

import { EventTypes, ITouchPoints, IPoints } from '../../types';
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

interface ITouchStartListenerState {
  element: HTMLDivElement;
  renderingEngineId: string;
  viewportId: string;
  startPointsList: ITouchPoints[];
  lastPointsList: ITouchPoints[];

  // only trigger one touch event in the case the user puts down multiple fingers
  touchStartTimeout: ReturnType<typeof setTimeout>;
  touchStartDelay: number; // must be greater than tap delay
  isTouchStart: boolean;

  // handle long press
  pressTimeout: ReturnType<typeof setTimeout>;
  pressDelay: number;
  pressMaxDistance: number;

  // handle taps
  tapMaxDistance: number;
  tapTimeout: ReturnType<typeof setTimeout>;
  taps: number;

  // handle swipes
  swipeTimeout: ReturnType<typeof setTimeout>;
  swipeDistanceThreshold: number;
}

// STATE
const defaultState: ITouchStartListenerState = {
  renderingEngineId: undefined,
  viewportId: undefined,
  element: null,
  startPointsList: [
    {
      page: [0, 0],
      client: [0, 0],
      canvas: [0, 0],
      world: [0, 0, 0],
      touch: null,
    },
  ],
  lastPointsList: [
    {
      page: [0, 0],
      client: [0, 0],
      canvas: [0, 0],
      world: [0, 0, 0],
      touch: null,
    },
  ],
  // TODO, these default values may need to optimized
  touchStartTimeout: null,
  touchStartDelay: 100,
  isTouchStart: false,

  pressTimeout: null,
  pressDelay: 700,
  pressMaxDistance: 5,

  taps: 0,
  tapTimeout: null,
  tapMaxDistance: 3,

  swipeTimeout: null,
  swipeDistanceThreshold: 70,
};

let state: ITouchStartListenerState = JSON.parse(JSON.stringify(defaultState));

function triggerEventCallback(ele, name, eventDetail) {
  if (runtimeSettings.get('debug')) {
    console.debug(name, eventDetail);
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
  if (!state.isTouchStart) {
    // this delay allows us to fire one event in the case of multiple touches
    // as each individual touch will fire a touchstart event
    clearTimeout(state.touchStartTimeout);
    clearTimeout(state.pressTimeout);
    clearTimeout(state.tapTimeout);
    state.touchStartTimeout = setTimeout(() => {
      _onTouchStart(evt);
    }, state.touchStartDelay);

    // this will clear on tap, touchstart, and touchend
    state.pressTimeout = setTimeout(() => {
      _onTouchPress(evt);
    }, state.pressDelay);

    document.addEventListener('touchend', _onTouchEnd);
  }
}

/**
 * _onTouchPress - Handle emission of touchstart events which are held down for a longer
 * period of time
 *
 * @private
 * @param evt - The touch event (touchstart)
 */
function _onTouchPress(evt: TouchEvent) {
  if (
    getDeltaDistance(state.startPointsList, state.lastPointsList).canvas <
    state.pressMaxDistance
  ) {
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
}

/**
 * _onTouchStart - Handle emission of touchstart events.
 *
 * @private
 * @param evt - The touch event (touchstart)
 */
function _onTouchStart(evt: TouchEvent) {
  state.isTouchStart = true;
  const startPointsList = getTouchEventPoints(evt, state.element);
  const startPoints = getMeanTouchPoints(startPointsList);
  const deltaPoints = getDeltaPoints(startPointsList, startPointsList);
  const deltaDistance = getDeltaDistanceBetweenIPoints(
    startPointsList,
    startPointsList
  );
  // deltaRotation
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

  document.addEventListener('touchmove', _onTouchDrag);
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
      : getDeltaPoints(currentPointsList, currentPointsList);

  const deltaDistance =
    currentPointsList.length === lastPointsList.length
      ? getDeltaDistanceBetweenIPoints(currentPointsList, lastPointsList)
      : getDeltaDistanceBetweenIPoints(currentPointsList, currentPointsList);

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
    deltaPoints,
    deltaDistance,
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
  clearTimeout(state.touchStartTimeout);
  clearTimeout(state.pressTimeout);
  clearTimeout(state.tapTimeout);
  if (state.isTouchStart) {
    // touch start occured, not a tap
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
    state = JSON.parse(JSON.stringify(defaultState));

    // Remove our temporary handlers which is only added when normalized touch
    // start fires
    document.removeEventListener('touchmove', _onTouchDrag);
  } else {
    // a tap occured
    _onTouchTap(evt);
  }

  document.removeEventListener('touchend', _onTouchEnd);
}

function _onTouchTap(evt: TouchEvent): void {
  const currentPointsList = getTouchEventPoints(evt, state.element);
  const lastPointsList = _updateTouchEventsLastPoints(
    state.element,
    state.lastPointsList
  );

  if (
    state.taps > 0 &&
    getDeltaDistance(currentPointsList, lastPointsList).canvas <
      state.tapMaxDistance
  ) {
    state.taps = state.taps + 1;
  }

  if (state.taps === 0) {
    state.taps = state.taps + 1;
  }

  state.lastPointsList = copyPointsList(currentPointsList); // Update the last points

  state.tapTimeout = setTimeout(() => {
    const eventDetail: EventTypes.TouchTapEventDetail = {
      event: evt,
      eventName: TOUCH_TAP,
      element: state.element,
      renderingEngineId: state.renderingEngineId,
      viewportId: state.viewportId,
      camera: {},
      currentPointsList,
      currentPoints: getMeanTouchPoints(currentPointsList),
      taps: state.taps,
    };
    triggerEventCallback(eventDetail.element, TOUCH_TAP, eventDetail);
    state = JSON.parse(JSON.stringify(defaultState));
  }, state.touchStartDelay - 10);
}

function _checkTouchSwipe(evt: TouchEvent, deltaPoints: IPoints) {
  const [x, y] = deltaPoints.canvas;
  if (
    Math.abs(x) > state.swipeDistanceThreshold ||
    Math.abs(y) > state.swipeDistanceThreshold
  ) {
    const eventDetail: EventTypes.TouchSwipeEventDetail = {
      event: evt,
      eventName: TOUCH_SWIPE,
      renderingEngineId: state.renderingEngineId,
      viewportId: state.viewportId,
      camera: {},
      element: state.element,
      swipe: null,
    };

    clearTimeout(state.swipeTimeout);
    state.swipeTimeout = setTimeout(() => {
      if (Math.abs(x) > Math.abs(y)) {
        if (x > 0) {
          eventDetail.swipe = Swipe.RIGHT;
        } else {
          eventDetail.swipe = Swipe.LEFT;
        }
      } else {
        if (y > 0) {
          eventDetail.swipe = Swipe.DOWN;
        } else {
          eventDetail.swipe = Swipe.UP;
        }
      }
      triggerEventCallback(eventDetail.element, TOUCH_SWIPE, eventDetail);
    }, state.touchStartDelay);
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
