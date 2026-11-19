import type vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import type vtkOpenGLRenderWindow from '@kitware/vtk.js/Rendering/OpenGL/RenderWindow';
import type { Point2, Point3 } from '../types';
import { canvasToNormalizedDisplay } from '../RenderingEngine/helpers/vtkCanvasCoordinateTransforms';

/**
 * A viewport that draws with a vtk.js renderer: a planar viewport on the GPU
 * or a 3D viewport.
 */
type VtkRenderedViewport = {
  getCanvas(): HTMLCanvasElement;
  getRenderer(): vtkRenderer | undefined;
};

/**
 * The display coordinates of vtk.js for a point of the canvas of a viewport,
 * as the legacy `viewport.getVtkDisplayCoords(canvasPos)` gave them. They are
 * pixels of the render window that the viewport draws in, from its bottom
 * left corner, with a depth of 0. A vtk.js picker takes them:
 *
 * ```ts
 * picker.pick(
 *   utilities.getVtkDisplayCoords(viewport, canvasPos),
 *   viewport.getRenderer()
 * );
 * ```
 *
 * The rendering engine draws several viewports in one render window, and the
 * renderer of a viewport covers only a part of it, so the point is placed in
 * that part. The canvas is read in device pixels.
 *
 * @param viewport - A viewport with a vtk.js renderer.
 * @param canvasPos - The point in CSS pixels, from the top left corner of the canvas.
 * @returns The display coordinates `[x, y, 0]`.
 * @throws When the viewport has no vtk.js renderer in a render window, as a
 * planar viewport that draws on the CPU.
 */
function getVtkDisplayCoords(
  viewport: VtkRenderedViewport,
  canvasPos: Point2
): Point3 {
  const renderer = viewport.getRenderer();
  const view = renderer?.getRenderWindow()?.getViews()[0] as
    | vtkOpenGLRenderWindow
    | undefined;

  if (!view) {
    throw new Error(
      'getVtkDisplayCoords: the viewport has no vtk.js renderer in a render window'
    );
  }

  const [x, y, z] = canvasToNormalizedDisplay({
    canvas: viewport.getCanvas(),
    renderer,
    canvasPos,
  });
  const [width, height] = view.getFramebufferSize();

  return [x * width, y * height, z];
}

export default getVtkDisplayCoords;
