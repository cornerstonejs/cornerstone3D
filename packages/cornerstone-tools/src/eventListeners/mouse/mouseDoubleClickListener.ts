import {
  getEnabledElement,
  triggerEvent,
} from '@precisionmetrics/cornerstone-render'
import CornerstoneTools3DEvents from '../../enums/CornerstoneTools3DEvents'
import getMouseEventPoints from './getMouseEventPoints'
import { EventTypes, IPoints } from '../../types'

/**
 * Captures and normalizes the double click event. Emits as a cornerstoneTools3D
 * double click event.
 *
 * @param evt - The mouse event.
 */
function mouseDoubleClickListener(evt: MouseEvent): void {
  const element = <HTMLElement>evt.currentTarget

  const { viewportUID, renderingEngineUID } = getEnabledElement(element)

  const startPoints = getMouseEventPoints(evt, element)
  const deltaPoints: IPoints = {
    page: [0, 0],
    client: [0, 0],
    canvas: [0, 0],
    world: [0, 0, 0],
  }

  const eventDetail: EventTypes.MouseDoubleClickEventDetail = {
    event: evt,
    eventName: CornerstoneTools3DEvents.MOUSE_DOUBLE_CLICK,
    viewportUID,
    renderingEngineUID,
    camera: {},
    element,
    startPoints,
    lastPoints: startPoints,
    currentPoints: startPoints,
    deltaPoints,
  }

  triggerEvent(
    element,
    CornerstoneTools3DEvents.MOUSE_DOUBLE_CLICK,
    eventDetail
  )
}

export default mouseDoubleClickListener
