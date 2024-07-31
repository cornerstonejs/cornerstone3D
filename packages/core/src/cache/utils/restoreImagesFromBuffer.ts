import { IImageVolume } from '../../types';
import cache from '../cache';

/**
 * This function will restore the images' pixel data from the shared array buffer
 * back to the individual images when the volume is purged from cache. It ensures
 * that each image retrieves its correct portion of data from the buffer based on
 * the previously stored offset and length information.
 *
 * @param volumeId - The volumeId whose images need to be restored.
 */
export function restoreImagesFromBuffer(volume: IImageVolume) {
  // if volume does not have getScalarData method, it means it is not a volume
  // sor return without doing anything
  if (!volume.getScalarData) {
    return;
  }

  // Retrieve the scalar data and the offset map from the volume
  const scalarData = volume.getScalarData();
  const imageCacheOffsetMap = volume.imageCacheOffsetMap;

  if (imageCacheOffsetMap.size === 0) {
    // This happens during testing and isn't an issue
    // console.warn('No cached images to restore for this volume.');
    return;
  }

  // Iterate over each image and restore its pixel data from the shared buffer
  for (const [imageId, { offset }] of imageCacheOffsetMap) {
    const image = cache.getImage(imageId);

    if (!image) {
      console.warn(`Image with id ${imageId} not found in cache.`);
      continue;
    }

    const viewPixelData = image.voxelManager.getScalarData();
    const length = viewPixelData.length;

    // Create a new view of the buffer for this specific image
    // @ts-ignore
    const pixelData = new viewPixelData.constructor(
      scalarData.buffer,
      offset,
      length
    );

    // Restore the original getPixelData function and pixelData
    image.getPixelData = () => pixelData;

    if (image.imageFrame) {
      image.imageFrame.pixelData = pixelData;
    }

    delete image.bufferView;

    // Optionally, increment the image cache size again if needed
    cache.incrementImageCacheSize(image.sizeInBytes);
  }

  console.log(`Images restored from buffer for volume ${volume.volumeId}.`);
}
