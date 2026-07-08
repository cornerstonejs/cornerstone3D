import type IRenderingEngine from './IRenderingEngine';
import type IStackViewport from './IStackViewport';
import type IVolumeViewport from './IVolumeViewport';

/**
 * Cornerstone Enabled Element interface
 */
interface IEnabledElement {
  /** Cornerstone Viewport instance - can be Stack or Volume, or Video Viewport as of now.
   * For the moment, need to cast to unknown first before casting to IVideoViewport
   * (TODO) - this will be done as part of adding annotation tools for video
   *
   * NOTE (Generic Viewport migration): for a direct Generic ("next") viewport
   * (`PLANAR_NEXT`, etc.), this is structurally an `IGenericViewport`. The union
   * is intentionally NOT widened to include `IGenericViewport` yet: doing so
   * forces every consumer that reads `enabledElement.viewport.getCamera()` /
   * `.setProperties()` (the tools render/annotation path) to narrow first, which
   * is the work tracked by the tools-camera migration (CS-8/CS-10). Until that
   * lands, narrow with `utilities.isGenericViewport(enabledElement.viewport)`
   * (which returns the viewport as `IGenericViewport`) when the native-next
   * surface is needed.
   */
  viewport: IStackViewport | IVolumeViewport;
  /** Cornerstone Rendering Engine instance */
  renderingEngine: IRenderingEngine;
  /** Unique ID of the viewport in the renderingEngine */
  viewportId: string;
  /** Unique ID of the renderingEngine */
  renderingEngineId: string;
  /** FrameOfReference the enabledElement is rendering inside */
  FrameOfReferenceUID?: string;
}

export type { IEnabledElement as default };
