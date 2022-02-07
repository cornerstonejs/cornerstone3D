import { vtkCamera } from 'vtk.js/Sources/Rendering/Core/Camera'
import ICamera from './ICamera'
import Point2 from './Point2'
import Point3 from './Point3'
import ViewportInputOptions from './ViewportInputOptions'
import { ActorEntry } from './IActor'

interface IViewport {
  uid: string
  sceneUID?: string
  renderingEngineUID: string
  type: string
  canvas: HTMLCanvasElement
  sx: number
  sy: number
  sWidth: number
  sHeight: number
  _actors: Map<string, any>
  defaultOptions: any
  options: ViewportInputOptions
  getFrameOfReferenceUID: () => string
  canvasToWorld: (canvasPos: Point2) => Point3
  worldToCanvas: (worldPos: Point3) => Point2
  getActors(): Array<ActorEntry>
  getActor(actorUID: string): ActorEntry
  setActors(actors: Array<ActorEntry>): void
  addActors(actors: Array<ActorEntry>): void
  addActor(actorEntry: ActorEntry): void
  removeAllActors(): void
  getRenderingEngine(): any
  getRenderer(): void
  render(): void
  setOptions(options: ViewportInputOptions, immediate: boolean): void
  reset(immediate: boolean): void
  resetCamera(): void
  getCanvas(): HTMLCanvasElement
  getCamera(): ICamera
  setCamera(cameraInterface: ICamera): void
  _getCorners(bounds: Array<number>): Array<number>[]
}

/**
 * @type ViewportInput
 * This type defines the shape of input, so we can throw when it is incorrect.
 */
type PublicViewportInput = {
  element: HTMLElement
  sceneUID?: string
  viewportUID: string
  type: string
  defaultOptions: ViewportInputOptions
}

type InternalViewportInput = {
  element: HTMLElement
  canvas: HTMLCanvasElement
  sceneUID?: string
  viewportUID: string
  type: string
  defaultOptions: ViewportInputOptions
}

type ViewportInput = {
  uid: string
  element: HTMLElement
  canvas: HTMLCanvasElement
  sceneUID?: string
  renderingEngineUID: string
  type: string
  sx: number
  sy: number
  sWidth: number
  sHeight: number
  defaultOptions: ViewportInputOptions
}

export type {
  IViewport,
  ViewportInput,
  PublicViewportInput,
  InternalViewportInput,
}
