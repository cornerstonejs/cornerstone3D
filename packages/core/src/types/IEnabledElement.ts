import type IRenderingEngine from './IRenderingEngine';
import type { IViewport } from './IViewport';

/**
 * Cornerstone Enabled Element interface
 */
interface IEnabledElement {
  /**
   * The viewport of the element: a viewport of any family, typed with the
   * members that every family has. Code that needs the members of a family
   * narrows: `utilities.viewportSupportsDisplaySetPresentation(viewport)` for
   * a planar viewport, `utilities.getViewportContentMode(viewport) === 'stack'`
   * for what it shows, or `renderingEngine.getViewport<PlanarViewport>(id)`.
   */
  viewport: IViewport;
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
