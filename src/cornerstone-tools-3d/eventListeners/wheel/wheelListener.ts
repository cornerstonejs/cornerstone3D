import normalizeWheel from './normalizeWheel'
import CornerstoneTools3DEvents from '../../enums/CornerstoneTools3DEvents'
import triggerEvent from './../../util/triggerEvent'
// ~~ VIEWPORT LIBRARY
import { getEnabledElement } from '@cornerstone'
import getMouseEventPoints from '../mouse/getMouseEventPoints'

/**
 * wheelListener - Captures and normalizes mouse wheel events. Emits as a
 * cornerstoneTools3D mouse wheel event.
 * @param {WheelEvent} evt The mouse wheel event.
 */
function wheelListener(evt: WheelEvent) {
  const element = <HTMLElement>evt.currentTarget
  const enabledElement = getEnabledElement(element)
  const { renderingEngineUID, sceneUID, viewportUID } = enabledElement

  // Prevent triggering MouseWheel events that are not real scroll events:
  // E.g. when clicking the MiddleMouseWheelButton, a deltaY of 0 is emitted.
  // See https://github.com/cornerstonejs/cornerstoneTools/issues/935
  if (evt.deltaY > -1 && evt.deltaY < 1) {
    return
  }

  evt.preventDefault()

  const { spinX, spinY, pixelX, pixelY } = normalizeWheel(evt)
  const direction = spinY < 0 ? -1 : 1

  const eventData = {
    renderingEngineUID,
    sceneUID,
    viewportUID,
    element,
    camera: {},
    detail: evt,
    wheel: {
      spinX,
      spinY,
      pixelX,
      pixelY,
      direction,
    },
    points: getMouseEventPoints(evt),
  }

  triggerEvent(element, CornerstoneTools3DEvents.MOUSE_WHEEL, eventData)
}

export default wheelListener
