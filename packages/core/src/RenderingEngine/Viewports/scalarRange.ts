import type { IImage, IImageVolume } from '../../types';
import { isVolumeLoading } from './renderingFidelity';

/**
 * The range of the values of an image: its minimum and maximum pixel values,
 * as its loader gives them (`IImage.minPixelValue` and `maxPixelValue`),
 * over all the components of a colour image. Undefined without an image, or
 * when the loader gave no finite values.
 */
export function getImageScalarRange(
  image: Pick<IImage, 'minPixelValue' | 'maxPixelValue'> | undefined
): [number, number] | undefined {
  const minPixelValue = image?.minPixelValue;
  const maxPixelValue = image?.maxPixelValue;

  if (!Number.isFinite(minPixelValue) || !Number.isFinite(maxPixelValue)) {
    return;
  }

  return [minPixelValue, maxPixelValue];
}

/**
 * The range of the values of a whole volume, as its voxel manager knows it
 * (`voxelManager.getRange()`): the range over the images of the volume that
 * have arrived, from the pixel values that their loader gave, or over the
 * images of the time point on display of a dynamic volume. Undefined while
 * the volume loads and no image of it has arrived (its voxel manager then
 * gives `[0, 0]`), and for a voxel manager without `getRange`.
 */
export function getVolumeScalarRange(
  imageVolume: Pick<IImageVolume, 'voxelManager' | 'loadStatus'> | undefined
): [number, number] | undefined {
  const range = imageVolume?.voxelManager?.getRange?.();

  if (!range || !Number.isFinite(range[0]) || !Number.isFinite(range[1])) {
    return;
  }

  if (range[0] === 0 && range[1] === 0 && isVolumeLoading(imageVolume)) {
    return;
  }

  return [range[0], range[1]];
}
