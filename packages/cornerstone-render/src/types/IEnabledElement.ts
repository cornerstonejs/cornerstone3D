import VolumeViewport from '../RenderingEngine/VolumeViewport'
import StackViewport from '../RenderingEngine/StackViewport'

import Scene from '../RenderingEngine/Scene'
import RenderingEngine from '../RenderingEngine/RenderingEngine'

interface IEnabledElement {
  viewport: VolumeViewport | StackViewport
  scene: Scene
  renderingEngine: RenderingEngine
  viewportUID: string
  sceneUID: string
  renderingEngineUID: string
  FrameOfReferenceUID: string
}

export default IEnabledElement
