import type { IImage, PixelDataTypedArray } from '../types';
import VoxelManager from './VoxelManager';

/**
 * Converts a color image that holds RGBA pixel data (for example one cached
 * by a CPU render with useRGBA) to RGB in place, so the GPU paths, which
 * build 3-component vtkImageData for color images, can use it. The decision
 * is made from the pixel data length, not from `image.rgba`, as the flag can
 * be set on data that was never converted to RGBA.
 *
 * The image's voxel manager, getPixelData, numberOfComponents and rgba flag
 * are updated together, and the typed array type is kept. Calling it again
 * on the same image does nothing.
 *
 * @param image - Cornerstone image to normalize
 */
export function normalizeRGBAImageToRGB(image: IImage): void {
  if (!image?.color || !image.voxelManager) {
    return;
  }
  const pixelData = image.voxelManager.getScalarData();
  const numPixels = image.columns * image.rows;
  if (pixelData.length !== numPixels * 4) {
    return;
  }

  const ArrayType = pixelData.constructor as new (
    length: number
  ) => PixelDataTypedArray;
  const rgbPixelData = new ArrayType(numPixels * 3);
  for (let i = 0; i < numPixels; i++) {
    rgbPixelData[i * 3] = pixelData[i * 4];
    rgbPixelData[i * 3 + 1] = pixelData[i * 4 + 1];
    rgbPixelData[i * 3 + 2] = pixelData[i * 4 + 2];
  }

  const voxelManager = VoxelManager.createImageVoxelManager({
    width: image.columns,
    height: image.rows,
    scalarData: rgbPixelData,
    numberOfComponents: 3,
  });
  image.voxelManager = voxelManager;
  image.getPixelData = () =>
    voxelManager.getScalarData() as PixelDataTypedArray;
  image.numberOfComponents = 3;
  image.rgba = false;
}

export default normalizeRGBAImageToRGB;
