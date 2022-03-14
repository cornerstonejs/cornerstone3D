import {
  getEnabledElement,
  triggerEvent,
} from '@precisionmetrics/cornerstone-render'
import CornerstoneTools3DEvents from '../../enums/CornerstoneTools3DEvents'
import getMouseEventPoints from './getMouseEventPoints'
import { MouseMoveEventData } from '../../types/EventTypes'

const eventName = CornerstoneTools3DEvents.MOUSE_MOVE

/**
 * Captures and normalizes the mouse move event. Emits as a cornerstoneTools3D
 * mouse move event.
 *
 * @param evt - The mouse event.
 */
function mouseMoveListener(evt: MouseEvent) {
  const element = <HTMLElement>evt.currentTarget
  const enabledElement = getEnabledElement(element)
  const { renderingEngineUID, viewportUID } = enabledElement

  const currentPoints = getMouseEventPoints(evt)
  const eventData: MouseMoveEventData = {
    renderingEngineUID,
    viewportUID,
    camera: {},
    element,
    currentPoints,
    eventName,
    event: evt,
  }

  triggerEvent(element, eventName, eventData)
}

export default mouseMoveListener
