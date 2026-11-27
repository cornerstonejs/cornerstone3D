import type { vtkObject } from '@kitware/vtk.js/interfaces';
import type vtkStreamingOpenGLRenderWindow from '../RenderingEngine/vtkClasses/vtkStreamingOpenGLRenderWindow';
import type vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import type vtkRenderWindow from '@kitware/vtk.js/Rendering/Core/RenderWindow';
import type vtkRenderWindowInteractor from '@kitware/vtk.js/Rendering/Core/RenderWindowInteractor';

import '@kitware/vtk.js/Common/Core/Points';
import '@kitware/vtk.js/Common/Core/DataArray';
import '@kitware/vtk.js/Common/DataModel/PolyData';
import '@kitware/vtk.js/Rendering/Core/Actor';
import '@kitware/vtk.js/Rendering/Core/Mapper';

type Viewport = [number, number, number, number];

interface RendererConfig {
  id: string;
  viewport: Viewport;
  background?: [number, number, number];
}

/**
 * The div that holds the offscreen canvas of a vtkOffscreenMultiRenderWindow.
 * `width` and `height` are plain properties, not DOM attributes: the rendering
 * engine writes the offscreen canvas size to them, and `resize()` reads them.
 */
export type OffscreenCanvasContainer = HTMLDivElement & {
  width: number;
  height: number;
};

export interface VtkOffscreenMultiRenderWindow extends vtkObject {
  renderWindow: vtkRenderWindow;
  getRenderWindow: () => vtkRenderWindow;

  openGLRenderWindow: ReturnType<
    typeof vtkStreamingOpenGLRenderWindow.newInstance
  >;
  getOpenGLRenderWindow: () => ReturnType<
    typeof vtkStreamingOpenGLRenderWindow.newInstance
  >;

  interactor: vtkRenderWindowInteractor;
  getInteractor: () => vtkRenderWindowInteractor;

  container: OffscreenCanvasContainer | null;
  getContainer: () => OffscreenCanvasContainer | null;

  addRenderer: (config: RendererConfig) => void;
  removeRenderer: (id: string) => void;
  getRenderer: (id: string) => vtkRenderer;
  getRenderers: () => Array<{ id: string; renderer: vtkRenderer }>;
  resize: () => void;
  setContainer: (el: OffscreenCanvasContainer) => void;
  destroy: () => void;
}
