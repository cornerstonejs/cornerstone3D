import VolumeViewport from '../RenderingEngine/VolumeViewport'
import StackViewport from '../RenderingEngine/StackViewport'

import RenderingEngine from '../RenderingEngine/RenderingEngine'

interface IEnabledElement {
  viewport: VolumeViewport | StackViewport
  renderingEngine: RenderingEngine
  viewportUID: string
  renderingEngineUID: string
  FrameOfReferenceUID: string
}

export default IEnabledElement
