import type { IRenderingEngine } from '../types';
import type IStackViewport from './IStackViewport';
import type IVolumeViewport from './IVolumeViewport';
import type IVideoViewport from './IVideoViewport';

/**
 * Cornerstone Enabled Element interface
 */
interface IEnabledElement {
  // TODO: Add IVideoViewport
  /** Cornerstone Viewport instance - can be Stack or Volume, or Video Viewport as of now */
  viewport: IStackViewport | IVolumeViewport; // | IVideoViewport;
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
