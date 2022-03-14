import RenderingEngine from '../RenderingEngine/RenderingEngine'
import IStackViewport from './IStackViewport'
import IVolumeViewport from './IVolumeViewport'

/**
 * Cornerstone Enabled Element interface
 */
interface IEnabledElement {
  /** Cornerstone Viewport instance - can be Stack or Volume Viewport as of now */
  viewport: IStackViewport | IVolumeViewport
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
