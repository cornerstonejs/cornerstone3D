import ICamera from './ICamera'
import Point2 from './Point2'
import Point3 from './Point3'

interface IViewport {
  uid: string
  sceneUID: string
  renderingEngineUID: string
  type: string
  canvas: HTMLCanvasElement
  sx: number
  sy: number
  sWidth: number
  sHeight: number
  defaultOptions: any
  //
  canvasToWorld: (canvasPos: Point2) => Point3
  getCamera: () => ICamera
  render: () => void
  setCamera: (cameraOptions: ICamera) => void
  worldToCanvas: (worldPos: Point3) => Point2
}

export default IViewport
