import type { IRenderingEngine } from '../types';
import type IStackViewport from './IStackViewport';
import type IVolumeViewport from './IVolumeViewport';

/**
 * Cornerstone Enabled Element interface
 */
interface IEnabledElement {
  /** Cornerstone Viewport instance - can be Stack or Volume, or Video Viewport as of now.
   * For the moment, need to cast to unknown first before casting to IVideoViewport
   * (TODO) - this will be done as part of adding annotation tools for video
   */
  viewport: IStackViewport | IVolumeViewport;
  /** Cornerstone Rendering Engine instance */
  renderingEngine: IRenderingEngine;
  /** Unique ID of the viewport in the renderingEngine */
  viewportId: string;
  /** Unique ID of the renderingEngine */
  renderingEngineId: string;
  /** FrameOfReference the enabledElement is rendering inside */
  FrameOfReferenceUID: string;
}

export default IEnabledElement;
