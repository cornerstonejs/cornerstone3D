import { VolumeViewport, StackViewport } from '@cornerstone'

interface IEnabledElement {
  viewport: StackViewport | VolumeViewport
  scene: any
  renderingEngine: any
  viewportUID: string
  sceneUID: string
  renderingEngineUID: string
  FrameOfReferenceUID: string
}

export default IEnabledElement
