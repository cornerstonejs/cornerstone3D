import Point2 from 'src/cornerstone-core/src/types/Point2'
import Point3 from 'src/cornerstone-core/src/types/Point3'

interface ICornerstoneToolsEventDetail {
  renderingEngineUID: string
  sceneUID: string
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
  page: Point2
  client: Point2
  canvas: Point2
  world: Point3
}

export default ICornerstoneToolsEventDetail

export { ICornerstoneToolsEventDetail, IPoints }
