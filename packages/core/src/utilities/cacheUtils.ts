import cache, { ImageVolume } from '../cache';
import { Events } from '../enums';
import eventTarget from '../eventTarget';
import { getConfiguration, getShouldUseSharedArrayBuffer } from '../init';

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
