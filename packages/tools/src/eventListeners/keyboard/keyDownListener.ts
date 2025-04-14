import { getEnabledElement, triggerEvent } from '@cornerstonejs/core';
import Events from '../../enums/Events';
import type {
  KeyDownEventDetail,
  KeyUpEventDetail,
} from '../../types/EventTypes';

interface IKeyDownListenerState {
  renderingEngineId: string;
  viewportId: string;
  key: string | null;
  keyCode: number | null;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
  element: HTMLDivElement;
}

const defaultState: IKeyDownListenerState = {
  //
  renderingEngineId: undefined,
  viewportId: undefined,
  //
  key: undefined,
  keyCode: undefined,
  ctrl: false,
  meta: false,
  alt: false,
  shift: false,
  element: null,
};

let state: IKeyDownListenerState = {
  //
  renderingEngineId: undefined,
  viewportId: undefined,
  //
  key: undefined,
  keyCode: undefined,
  ctrl: false,
  meta: false,
  alt: false,
  shift: false,
  element: null,
};

const ignoredModifierNames = ['control', 'alt', 'shift', 'meta'];

/**
 * Normalizes the keyboard event and triggers KEY_DOWN event from CornerstoneTools3D events
 * @param evt - DOM Keyboard event
 */
function keyListener(evt: KeyboardEvent): void {
  if (ignoredModifierNames.includes(evt.key.toLowerCase())) {
    return;
  }
  // Only listen to key events on the element
  state.element = <HTMLDivElement>evt.currentTarget;

  const enabledElement = getEnabledElement(state.element);
  const { renderingEngineId, viewportId } = enabledElement;

  state.renderingEngineId = renderingEngineId;
  state.viewportId = viewportId;
  state.key = evt.key;
  state.keyCode = evt.keyCode;
  state.ctrl = evt.ctrlKey;
  state.meta = evt.metaKey;
  state.alt = evt.altKey;
  state.shift = evt.shiftKey;

  evt.preventDefault();
  const eventDetail: KeyDownEventDetail = {
    renderingEngineId: state.renderingEngineId,
    viewportId: state.viewportId,
    element: state.element,
    key: state.key,
    keyCode: state.keyCode,
    ctrl: evt.ctrlKey,
    meta: evt.metaKey,
    alt: evt.altKey,
    shift: evt.shiftKey,
    // detail: evt,
    // Todo: mouse event points can be used later for placing tools with a key
    // e.g., putting an arrow/probe/etc. on the mouse position. Another use case
    // hovering and deleting the tool
    // points: getMouseEventPoints(evt),
  };

  triggerEvent(eventDetail.element, Events.KEY_DOWN, eventDetail);

  document.addEventListener('keyup', _onKeyUp);
  document.addEventListener('visibilitychange', _onVisibilityChange);

  // Todo: handle combination of keys
  state.element.removeEventListener('keydown', keyListener);
}

/**
 * Whenever the visibility (i.e. tab focus) changes such that the tab is NOT the
 * active tab, reset the modifier key.
 */
function _onVisibilityChange(): void {
  document.removeEventListener('visibilitychange', _onVisibilityChange);
  if (document.visibilityState === 'hidden') {
    resetModifierKey();
  }
}

function _onKeyUp(evt: KeyboardEvent): void {
  const eventDetail: KeyUpEventDetail = {
    renderingEngineId: state.renderingEngineId,
    viewportId: state.viewportId,
    element: state.element,
    key: state.key,
    keyCode: state.keyCode,
    ctrl: evt.ctrlKey,
    meta: evt.metaKey,
    alt: evt.altKey,
    shift: evt.shiftKey,
    // detail: evt,
  };

  // Remove our temporary handlers
  document.removeEventListener('keyup', _onKeyUp);
  document.removeEventListener('visibilitychange', _onVisibilityChange);
  state.element.addEventListener('keydown', keyListener);

  // Restore `state` to `defaultState`
  state = structuredClone(defaultState);
  triggerEvent(eventDetail.element, Events.KEY_UP, eventDetail);
}

export function getModifierKey() {
  return {
    key: state.key,
    keyCode: state.keyCode,
    ctrl: state.ctrl,
    meta: state.meta,
    alt: state.alt,
    shift: state.shift,
  };
}

export function resetModifierKey(): void {
  state.keyCode = undefined;
  state.key = undefined;
  state.ctrl = false;
  state.meta = false;
  state.alt = false;
  state.shift = false;
}

export default keyListener;
