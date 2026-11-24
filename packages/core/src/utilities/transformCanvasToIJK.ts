import type { Point2 } from '../types';
import type PlanarViewport from '../RenderingEngine/Viewports/Planar/PlanarViewport';
import transformWorldToIndex from './transformWorldToIndex';

/**
 * Convert coordinates from canvas to index (volume) space
 * @param viewport - Stack or Volume viewport
 * @param ijkPoint - 2D point in canvas space
 * @returns 3D point in index (volume) space
 */
export function transformCanvasToIJK(
  viewport: PlanarViewport,
  canvasPoint: Point2
) {
  const { imageData: vtkImageData } = viewport.getImageData();
  const worldPoint = viewport.canvasToWorld(canvasPoint);

  return transformWorldToIndex(vtkImageData, worldPoint);
}
