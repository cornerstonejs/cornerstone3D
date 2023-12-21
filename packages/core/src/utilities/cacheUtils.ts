import cache, { ImageVolume } from '../cache';
import { Events } from '../enums';
import eventTarget from '../eventTarget';
import { getConfiguration, getShouldUseSharedArrayBuffer } from '../init';
import { IVolume } from '../types';

/**
 * This function will check if the cache optimization is enabled and if it is
 * it will check if the created volume was derived from an already cached stack
 * of images, if so it will go back to the image cache and create a view at the
 * correct offset of the bigger volume array buffer, this will save memory.
 *
 * @param volumeId - The volumeId that will be checked for cache optimization
 */
export function performCacheOptimizationForVolume(volumeId) {
  const { enableCacheOptimization } = getConfiguration();
  const shouldUseSAB = getShouldUseSharedArrayBuffer();

  const performOptimization = enableCacheOptimization && shouldUseSAB;
  if (!performOptimization) {
    return;
  }

  const callback = (evt) => {
    if (evt.detail.volumeId !== volumeId) {
      return;
    }

    // go get each of the images from the cache
    const volume = cache.getVolume(volumeId);

    if (!(volume instanceof ImageVolume)) {
      return;
    }

    const scalarData = volume.getScalarData();

    const imageCacheOffsetMap = volume.imageCacheOffsetMap;

    if (imageCacheOffsetMap.size === 0) {
      return;
    }

    // for each image, get the image from the cache, and replace its
    // scalar data with the volume's scalar data view at the correct offset
    for (const [imageId, { offset }] of imageCacheOffsetMap) {
      const image = cache.getImage(imageId);

      if (!image) {
        continue;
      }

      const imageFrame = image.imageFrame;

      let pixelData;
      if (imageFrame) {
        pixelData = imageFrame.pixelData;
      } else {
        pixelData = image.getPixelData();
      }

      const view = new pixelData.constructor(
        scalarData.buffer,
        offset,
        pixelData.length
      );

      image.getPixelData = () => view;

      if (imageFrame) {
        imageFrame.pixelData = view;
      }

      image.bufferView = {
        buffer: scalarData.buffer,
        offset,
      };

      cache.decrementImageCacheSize(image.sizeInBytes);
    }

    eventTarget.removeEventListener(
      Events.IMAGE_VOLUME_LOADING_COMPLETED,
      callback
    );

    console.log(
      `Cache optimization performed for volume ${volumeId}. Images now use array view instead of copy.`
    );
  };

  eventTarget.addEventListener(Events.IMAGE_VOLUME_LOADING_COMPLETED, callback);
}

/**
 * This function will restore the images' pixel data from the shared array buffer
 * back to the individual images when the volume is purged from cache. It ensures
 * that each image retrieves its correct portion of data from the buffer based on
 * the previously stored offset and length information.
 *
 * @param volumeId - The volumeId whose images need to be restored.
 */
export function restoreImagesFromBuffer(volume: IVolume) {
  if (!(volume instanceof ImageVolume)) {
    console.warn(
      'Volume is not an ImageVolume. Cannot restore images from buffer.'
    );
    return;
  }

  // Retrieve the scalar data and the offset map from the volume
  const scalarData = volume.getScalarData();
  const imageCacheOffsetMap = volume.imageCacheOffsetMap;

  if (imageCacheOffsetMap.size === 0) {
    console.warn('No cached images to restore for this volume.');
    return;
  }

  // Iterate over each image and restore its pixel data from the shared buffer
  for (const [imageId, { offset, length }] of imageCacheOffsetMap) {
    const image = cache.getImage(imageId);

    if (!image) {
      console.warn(`Image with id ${imageId} not found in cache.`);
      continue;
    }

    const viewPixelData = image.getPixelData();

    // Create a new view of the buffer for this specific image
    // @ts-ignore
    const pixelData = new viewPixelData.constructor(
      scalarData.buffer,
      offset,
      length
    );

    // Restore the original getPixelData function and pixelData
    image.getPixelData = (() => pixelData).bind(image);

    if (image.imageFrame) {
      image.imageFrame.pixelData = pixelData;
    }

    delete image.bufferView;

    // Optionally, increment the image cache size again if needed
    cache.incrementImageCacheSize(image.sizeInBytes);
  }

  console.log(`Images restored from buffer for volume ${volume.volumeId}.`);
}
