import type { IViewport, Point2 } from '../types';
import type PlanarViewport from '../RenderingEngine/GenericViewport/Planar/PlanarViewport';
import transformWorldToIndex from './transformWorldToIndex';

/**
 * Convert coordinates from canvas to index (volume) space
 * @param viewport - Stack or Volume viewport
 * @param ijkPoint - 2D point in canvas space
 * @returns 3D point in index (volume) space
 */
export function transformCanvasToIJK(
  viewport: IViewport | PlanarViewport,
  canvasPoint: Point2
) {
  const { imageData: vtkImageData } = viewport.getImageData();
  const worldPoint = viewport.canvasToWorld(canvasPoint);

  return transformWorldToIndex(vtkImageData, worldPoint);
}
