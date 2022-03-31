import _cloneDeep from 'lodash.clonedeep';
import { getEnabledElement, triggerEvent } from '@cornerstonejs/core';
import Events from '../../enums/Events';
import { KeyDownEventDetail, KeyUpEventDetail } from '../../types/EventTypes';

interface IKeyDownListenerState {
  renderingEngineId: string;
  viewportId: string;
  key: string | null;
  keyCode: number | null;
  element: HTMLDivElement;
}

const defaultState: IKeyDownListenerState = {
  //
  renderingEngineId: undefined,
  viewportId: undefined,
  //
  key: undefined,
  keyCode: undefined,
  element: null,
};

let state: IKeyDownListenerState = {
  //
  renderingEngineId: undefined,
  viewportId: undefined,
  //
  key: undefined,
  keyCode: undefined,
  element: null,
};

/**
 * Normalizes the keyboard event and triggers KEY_DOWN event from CornerstoneTools3D events
 * @param evt - DOM Keyboard event
 */
function keyListener(evt: KeyboardEvent): void {
  state.element = <HTMLDivElement>evt.currentTarget;

  const enabledElement = getEnabledElement(state.element);
  const { renderingEngineId, viewportId } = enabledElement;

  state.renderingEngineId = renderingEngineId;
  state.viewportId = viewportId;
  state.key = evt.key;
  state.keyCode = evt.keyCode;

  evt.preventDefault();
  const eventDetail: KeyDownEventDetail = {
    renderingEngineId: state.renderingEngineId,
    viewportId: state.viewportId,
    element: state.element,
    key: state.key,
    keyCode: state.keyCode,

    // detail: evt,
    // Todo: mouse event points can be used later for placing tools with a key
    // e.g., putting an arrow/probe/etc. on the mouse position. Another use case
    // hovering and deleting the tool
    // points: getMouseEventPoints(evt),
  };

  triggerEvent(eventDetail.element, Events.KEY_DOWN, eventDetail);

  document.addEventListener('keyup', _onKeyUp);

  // Todo: handle combination of keys
  state.element.removeEventListener('keydown', keyListener);
}

function _onKeyUp(evt: KeyboardEvent): void {
  const eventDetail: KeyUpEventDetail = {
    renderingEngineId: state.renderingEngineId,
    viewportId: state.viewportId,
    element: state.element,
    key: state.key,
    keyCode: state.keyCode,
    // detail: evt,
  };

  // Remove our temporary handlers
  document.removeEventListener('keyup', _onKeyUp);
  state.element.addEventListener('keydown', keyListener);

  // Restore `state` to `defaultState`
  state = _cloneDeep(defaultState);
  triggerEvent(eventDetail.element, Events.KEY_UP, eventDetail);
}

export function getModifierKey(): number | undefined {
  return state.keyCode;
}

export function resetModifierKey(): void {
  state.keyCode = undefined;
}

export default keyListener;
