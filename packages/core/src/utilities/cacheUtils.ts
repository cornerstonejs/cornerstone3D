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

  // Process image cache offset map if it has data
  if (volume.imageCacheOffsetMap.size > 0) {
    _processImageCacheOffsetMap(volume, scalarData);
  } else {
    // Process images directly associated with the volume
    _processVolumeImages(volume, scalarData);
  }

  console.log(
    `Cache optimization performed for volume ${volume.volumeId}. Images now use array view instead of copy.`
  );
}

function _processImageCacheOffsetMap(volume, scalarData) {
  volume.imageCacheOffsetMap.forEach(({ offset }, imageId) => {
    const image = cache.getImage(imageId);
    if (!image) {
      return;
    }

    _updateImageWithScalarDataView(image, scalarData, offset);
    cache.decrementImageCacheSize(image.sizeInBytes);
  });
}

function _processVolumeImages(volume, scalarData) {
  volume.imageIds.forEach((imageId) => {
    const image = cache.getImage(imageId);
    if (!image) {
      return;
    }

    const index = volume.getImageIdIndex(imageId);
    const offset = index * image.getPixelData().length;

    _updateImageWithScalarDataView(image, scalarData, offset);
    cache.decrementImageCacheSize(image.sizeInBytes);
  });
}

function _updateImageWithScalarDataView(image, scalarData, offset) {
  const pixelData = image.imageFrame
    ? image.imageFrame.pixelData
    : image.getPixelData();

  const view = new pixelData.constructor(
    scalarData.buffer,
    offset,
    pixelData.length
  );

  image.getPixelData = () => view;

  if (image.imageFrame) {
    image.imageFrame.pixelData = view;
  }

  image.bufferView = {
    buffer: scalarData.buffer,
    offset,
  };
}
