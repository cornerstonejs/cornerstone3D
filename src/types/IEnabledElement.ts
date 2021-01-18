import IViewport from './IViewport'

interface IEnabledElement {
  viewport: IViewport
  scene: any
  renderingEngine: any
  viewportUID: string
  sceneUID: string
  renderingEngineUID: string
  FrameOfReferenceUID: string
}

export default IEnabledElement
