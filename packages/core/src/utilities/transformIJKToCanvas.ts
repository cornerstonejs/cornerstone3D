import { IStackViewport, IVolumeViewport, Point3 } from '../types';
import transformIndexToWorld from './transformIndexToWorld';

/**
 * Convert coordinates from index (volume) to canvas space
 * @param viewport - Stack or Volume viewport
 * @param ijkPoint - 3D point in index (volume) space
 * @returns 2D point in canvas space
 */
export function transformIJKToCanvas(
  viewport: IVolumeViewport | IStackViewport,
  ijkPoint: Point3
) {
  const { imageData: vtkImageData } = viewport.getImageData();
  const worldPoint = transformIndexToWorld(vtkImageData, ijkPoint);

  return viewport.worldToCanvas(worldPoint);
}
