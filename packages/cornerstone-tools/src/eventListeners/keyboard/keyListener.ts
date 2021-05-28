import { getEnabledElement, triggerEvent } from '@ohif/cornerstone-render'
import CornerstoneTools3DEvents from '../../enums/CornerstoneTools3DEvents'
// ~~ VIEWPORT LIBRARY
import getMouseEventPoints from '../mouse/getMouseEventPoints'

/**
 * Normalizes the keyboard event and triggers KEY_DOWN event from CornerstoneTools3D events
 * @param evt keyboard event
 */
function keyListener(evt): void {
  const element = <HTMLElement>evt.currentTarget
  const enabledElement = getEnabledElement(element)
  const { renderingEngineUID, sceneUID, viewportUID } = enabledElement

  evt.preventDefault()

  const eventData = {
    renderingEngineUID,
    sceneUID,
    viewportUID,
    element,
    camera: {},
    detail: evt,
    key: evt.key,
    points: getMouseEventPoints(evt),
  }

  triggerEvent(element, CornerstoneTools3DEvents.KEY_DOWN, eventData)
}

export default keyListener
