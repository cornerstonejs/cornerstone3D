import VolumeViewport from '../RenderingEngine/VolumeViewport'
import StackViewport from '../RenderingEngine/StackViewport'

import RenderingEngine from '../RenderingEngine/RenderingEngine'

/**
 * Cornerstone Enabled Element interface
 */
interface IEnabledElement {
  /** Cornerstone Viewport instance - can be Stack or Volume Viewport as of now */
  viewport: VolumeViewport | StackViewport
  /** Cornerstone Rendering Engine instance */
  renderingEngine: RenderingEngine
  /** Unique ID of the viewport in the renderingEngine */
  viewportUID: string
  /** Unique ID of the renderingEngine */
  renderingEngineUID: string
  /** FrameOfReference the enabledElement is rendering inside */
  FrameOfReferenceUID: string
}

export default IEnabledElement
