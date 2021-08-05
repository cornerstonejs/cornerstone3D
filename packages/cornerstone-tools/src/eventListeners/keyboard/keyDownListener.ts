import { getEnabledElement, triggerEvent } from '@ohif/cornerstone-render'
import CornerstoneTools3DEvents from '../../enums/CornerstoneTools3DEvents'
import _cloneDeep from 'lodash.clonedeep'

interface IKeyDownListenerState {
  renderingEngineUID: string
  sceneUID: string
  viewportUID: string
  key: string | null
  keyCode: number | null
  element: HTMLElement
}

const defaultState: IKeyDownListenerState = {
  //
  renderingEngineUID: undefined,
  sceneUID: undefined,
  viewportUID: undefined,
  //
  key: undefined,
  keyCode: undefined,
  element: null,
}

let state: IKeyDownListenerState = {
  //
  renderingEngineUID: undefined,
  sceneUID: undefined,
  viewportUID: undefined,
  //
  key: undefined,
  keyCode: undefined,
  element: null,
}

/**
 * Normalizes the keyboard event and triggers KEY_DOWN event from CornerstoneTools3D events
 * @param evt keyboard event
 */
function keyListener(evt: KeyboardEvent): void {
  state.element = <HTMLElement>evt.target

  const enabledElement = getEnabledElement(state.element)
  const { renderingEngineUID, sceneUID, viewportUID } = enabledElement

  state.renderingEngineUID = renderingEngineUID
  state.sceneUID = sceneUID
  state.viewportUID = viewportUID
  state.key = evt.key
  state.keyCode = evt.keyCode

  evt.preventDefault()
  const eventData = {
    renderingEngineUID: state.renderingEngineUID,
    sceneUID: state.sceneUID,
    viewportUID: state.viewportUID,
    element: state.element,
    detail: evt,
    key: state.key,
    keyCode: state.keyCode,

    // Todo: mouse event points can be used later for placing tools with a key
    // e.g., putting an arrow/probe/etc. on the mouse position. Another use case
    // hovering and deleting the tool
    // points: getMouseEventPoints(evt),
  }

  triggerEvent(eventData.element, CornerstoneTools3DEvents.KEY_DOWN, eventData)

  document.addEventListener('keyup', _onKeyUp)

  // Todo: handle combination of keys
  state.element.removeEventListener('keydown', keyListener)
}

function _onKeyUp(evt: KeyboardEvent): void {
  const eventData = {
    renderingEngineUID: state.renderingEngineUID,
    sceneUID: state.sceneUID,
    viewportUID: state.viewportUID,
    element: state.element,
    detail: evt,
    key: state.key,
    keyCode: state.keyCode,
  }

  // Remove our temporary handlers
  document.removeEventListener('keyup', _onKeyUp)
  state.element.addEventListener('keydown', keyListener)

  // Restore `state` to `defaultState`
  state = _cloneDeep(defaultState)
  triggerEvent(eventData.element, CornerstoneTools3DEvents.KEY_UP, eventData)
}

export function getModifierKey(): number | undefined {
  return state.keyCode
}

export default keyListener
