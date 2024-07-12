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

  const scalarData = volume.getScalarData();

  // if imageCacheOffsetMap is present means we have a volume derived from a stack
  // and we can use that information to optimize simpler
  volume.imageCacheOffsetMap.size > 0
    ? _processImageCacheOffsetMap(volume, scalarData)
    : _processVolumeImages(volume, scalarData);
}

/**
 * This function will process the volume images and replace the pixel data of each
 * image in the image cache (if found) with a view of the volume's scalar data.
 * This function is used when the volume is derived from an already cached stack
 * of images.
 *
 * @param volume - The volume to process.
 * @param scalarData - The scalar data to use for the volume.
 */
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

/**
 * This function will process the volume images and replace the pixel data of each
 * image in the image cache (if found) with a view of the volume's scalar data.
 * This function is used when the volume is not derived from an already cached stack
 * of images.
 *
 * @param volume - The volume to process.
 * @param scalarData - The scalar data to use for the volume.
 */
function _processVolumeImages(volume, scalarData) {
  let compatibleScalarData = scalarData;

  if (!volume.imageIds?.length) {
    return;
  }

  let sampleImageIdWithImage = volume.imageIds.find((imageId) => {
    const image = cache.getImage(imageId);
    return image;
  });

  if (!sampleImageIdWithImage) {
    // No image in the cache; we need to create images from scalar data.
    // This allows us to use these images natively when converting to stack,
    // avoiding recreation later.
    // This approach is particularly useful for labelmaps, ensuring data
    // remains synced between the volume and the stack.
    volume.decache();

    sampleImageIdWithImage = volume.imageIds[0];
  }

  const sampleImage = cache.getImage(sampleImageIdWithImage);
  const samplePixelData =
    sampleImage.imageFrame?.pixelData || sampleImage.getPixelData();

  // Check if the types of scalarData and pixelData are different.
  if (scalarData.constructor !== samplePixelData.constructor) {
    // If so, create a new typed array of the same type as pixelData and copy the values from scalarData.
    compatibleScalarData = new samplePixelData.constructor(scalarData.length);

    // Copy values from scalarData to compatibleScalarData.
    compatibleScalarData.set(scalarData);
  }

  volume.imageIds.forEach((imageId) => {
    const image = cache.getImage(imageId);
    if (!image) {
      return;
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
