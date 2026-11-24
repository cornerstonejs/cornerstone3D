import type vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import type { ActorEntry } from '../types/IActor';
import type { IViewport } from '../types/IViewport';
import type { ViewportWidget } from './Viewports/Volume3D/viewport3DTypes';

/**
 * A viewport as the rendering engines see it: the public interface and the
 * members that the engines read and write to draw it. Every viewport class
 * has the members that its family needs; the public interface `IViewport`
 * does not list them. The package does not export this type.
 */
interface EngineViewport extends IViewport {
  /** The canvas on the element that the viewport draws to. */
  readonly canvas: HTMLCanvasElement;
  /** The x offset of the viewport in the offscreen canvas. */
  sx?: number;
  /** The y offset of the viewport in the offscreen canvas. */
  sy?: number;
  /** The width of the viewport in the offscreen canvas, in device pixels. */
  sWidth?: number;
  /** The height of the viewport in the offscreen canvas, in device pixels. */
  sHeight?: number;
  /** Whether a draw of the viewport fires no `IMAGE_RENDERED`. */
  suppressEvents?: boolean;
  /** Whether the viewport draws itself, without the vtk.js render window. */
  getUseCustomRenderingPipeline(): boolean;
  /**
   * Draws a viewport that draws itself and gives the detail of its
   * `IMAGE_RENDERED`.
   */
  customRenderViewportToCanvas?(): unknown;
  /** The vtk.js renderer of a viewport that draws through vtk.js. */
  getRenderer?(): vtkRenderer;
  /** The actors of a viewport that draws through vtk.js. */
  getActors?(): ActorEntry[];
  /** The vtk.js widgets of the viewport. */
  getWidgets?(): ViewportWidget[];
  /** The render passes of the viewport, or null for the default ones. */
  getRenderPasses?(): unknown[] | null;
  /**
   * Fits the view to the new size of the canvas, which a resize with
   * `keepCamera` false asks for, as the legacy `resetCameraForResize` did.
   */
  resetViewStateForResize?(): boolean;
}

export type { EngineViewport as default };
