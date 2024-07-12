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
  // If the volume is not an ImageVolume (i.e., not image-based),
  // we cannot perform cache optimization. Volumes like NIFTI are
  // not image-based and cannot be optimized this way. However,
  // other volumes like streaming image volumes or derived volumes
  // from any image-based volume can be optimized. This is because
  // they have an imageId, allowing us to allocate images with views.
  // As a result, when they convert to a stack in the future,
  // they already have the views of the volume's scalar data.
  if (!(volume instanceof ImageVolume)) {
    return;
  }

  if (!volume.imageIds?.length) {
    console.warn(
      `Volume with ID ${volume.volumeId} does not have any images to optimize.`
    );

    return;
  }

  const scalarData = volume.getScalarData();

  // if imageCacheOffsetMap is present means we have a volume derived from a stack
  // and we can use that information to optimize simpler
  // volume.imageCacheOffsetMap.size > 0
  //   ? _processImageCacheOffsetMap(volume, scalarData)
  //   : _processVolumeImages(volume, scalarData);

  volume.imageIds.forEach((imageId, imageIdIndex) => {
    let image = cache.getImage(imageId);
    if (image) {
      // check if this has already a view of the scalar data
      if (image.bufferView) {
        return;
      }

      console.warn(
        'Todo: handle this scenario where the image is in the image cache but the volume is added after somehow'
      );
      return;
    }

    const inOffSetMap =
      volume.imageCacheOffsetMap.has(imageId) &&
      volume.imageCacheOffsetMap.get(imageId).offset;

    if (inOffSetMap) {
      const image = cache.getImage(imageId);
      const offset = volume.imageCacheOffsetMap.get(imageId).offset;
      _updateImageWithScalarDataView(image, scalarData, offset);
      cache.decrementImageCacheSize(image.sizeInBytes);
      return;
    }

    // extract the image from the volume
    image = volume.getCornerstoneImage(imageId, imageIdIndex);

    // 3. Caching the image
    if (!cache.getImageLoadObject(imageId)) {
      cache.putImageSync(imageId, image);
    }

    let compatibleScalarData = scalarData;
    const samplePixelData = image.imageFrame?.pixelData || image.getPixelData();

    // Check if the types of scalarData and pixelData are different.
    if (scalarData.constructor !== samplePixelData.constructor) {
      // If so, create a new typed array of the same type as pixelData and copy the values from scalarData.
      compatibleScalarData = new samplePixelData.constructor(scalarData.length);

      // Copy values from scalarData to compatibleScalarData.
      compatibleScalarData.set(scalarData);
    }

    const index = volume.getImageIdIndex(imageId);
    const offset = index * image.getPixelData().byteLength;

    _updateImageWithScalarDataView(image, compatibleScalarData, offset);
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
