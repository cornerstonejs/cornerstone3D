import CornerstoneTools3DEvents from '../../enums/CornerstoneTools3DEvents'
import triggerEvent from './../../util/triggerEvent'
import getMouseEventPoints from './getMouseEventPoints'
import { getEnabledElement } from '@cornerstone'

const eventName = CornerstoneTools3DEvents.MOUSE_MOVE

/**
 * Captures and normalizes the mouse move event. Emits as a cornerstoneTools3D
 * mouse move event.
 *
 * @param {MouseEvent} evt The mouse event.
 */
function mouseMoveListener(evt: MouseEvent) {
  const element = <HTMLElement>evt.currentTarget
  const enabledElement = getEnabledElement(element)
  const { renderingEngineUID, sceneUID, viewportUID } = enabledElement

  const currentPoints = getMouseEventPoints(evt)
  const eventData = {
    renderingEngineUID,
    sceneUID,
    viewportUID,
    camera: {},
    element,
    currentPoints,
    eventName,
  }

  triggerEvent(element, eventName, eventData)
}

export default mouseMoveListener
