import { Types } from '@precisionmetrics/cornerstone-render'

interface ICornerstoneToolsEventDetail {
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
  eventName: string
}

type IPoints = {
  page: Types.Point2
  client: Types.Point2
  canvas: Types.Point2
  world: Types.Point3
}

export default ICornerstoneToolsEventDetail

export { ICornerstoneToolsEventDetail, IPoints }
