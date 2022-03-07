import { Types } from '@precisionmetrics/cornerstone-render'
import IPoints from './IPoints'

type NormalizedMouseEventData = {
  eventName: string
  renderingEngineUID: string
  viewportUID: string

  event: Record<string, unknown> | MouseEvent
  camera: Record<string, unknown>
  element: HTMLElement
  //
  startPoints: IPoints
  lastPoints: IPoints
  currentPoints: IPoints
  deltaPoints: IPoints
}

type NormalizedMouseEventType = Types.CustomEventType<NormalizedMouseEventData>

export { NormalizedMouseEventData, NormalizedMouseEventType }
