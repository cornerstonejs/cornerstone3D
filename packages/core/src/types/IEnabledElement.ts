import type { IRenderingEngine } from '../types';
import type IStackViewport from './IStackViewport';
import type IVolumeViewport from './IVolumeViewport';

/**
 * Cornerstone Enabled Element interface
 */
interface IEnabledElement {
  /** Cornerstone Viewport instance - can be Stack or Volume Viewport as of now */
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
