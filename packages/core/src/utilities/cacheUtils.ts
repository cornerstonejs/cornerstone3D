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
export function setupCacheOptimizationEventListener(volumeId) {
  const { enableCacheOptimization } = getConfiguration();
  const shouldUseSAB = getShouldUseSharedArrayBuffer();

  const performOptimization = enableCacheOptimization && shouldUseSAB;
  if (!performOptimization) {
    return;
  }

  eventTarget.addEventListenerOnce(
    Events.IMAGE_VOLUME_LOADING_COMPLETED,
    (evt) => {
      if (evt.detail.volumeId !== volumeId) {
        return;
      }

      const volume = cache.getVolume(volumeId);

      performCacheOptimizationForVolume(volume);
    }
  );
}

/**
 * Performs cache optimization for a volume by replacing the pixel data of each image
 * in the image cache (if found) with a view of the volume's scalar data.
 * @param options - The options for cache optimization.
 * @param options.volumeId - The ID of the volume.
 */
export function performCacheOptimizationForVolume(volume) {
  if (!(volume instanceof ImageVolume)) {
    return;
  }

  const scalarData = volume.getScalarData();

  // check if during the loading of the volume we were using the
  // image cache to load the volume
  const imageCacheOffsetMap = volume.imageCacheOffsetMap;
  if (imageCacheOffsetMap.size > 0) {
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

    console.log(
      `Cache optimization performed for volume ${volume.volumeId}. Images now use array view instead of copy.`
    );
    return;
  }

  // there is one more scenario where we can perform cache optimization
  // whether we used the image pixelData and locally created a volume from it
  volume.imageIds.forEach((imageId) => {
    const image = cache.getImage(imageId);

    if (!image) {
      return;
    }

    const imageFrame = image.imageFrame;

    let pixelData;
    if (imageFrame) {
      pixelData = imageFrame.pixelData;
    } else {
      pixelData = image.getPixelData();
    }

    const index = volume.getImageIdIndex(imageId);

    const view = new pixelData.constructor(
      scalarData.buffer,
      index * pixelData.length,
      pixelData.length
    );

    image.getPixelData = () => view;

    if (imageFrame) {
      imageFrame.pixelData = view;
    }

    image.bufferView = {
      buffer: scalarData.buffer,
      offset: 0,
    };

    cache.decrementImageCacheSize(image.sizeInBytes);
  });
}
