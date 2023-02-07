import {
  ICache,
  IImage,
  IImageVolume,
  IGeometry,
  IImageLoadObject,
  IVolumeLoadObject,
  IGeometryLoadObject,
  ICachedImage,
  ICachedVolume,
  ICachedGeometry,
  EventTypes,
} from '../types';
import { triggerEvent, imageIdToURI } from '../utilities';
import eventTarget from '../eventTarget';
import Events from '../enums/Events';

const MAX_CACHE_SIZE_1GB = 1073741824;

class Cache implements ICache {
  private readonly _imageCache: Map<string, ICachedImage>; // volatile space
  private readonly _volumeCache: Map<string, ICachedVolume>; // non-volatile space
  // Todo: contour for now, but will be used for surface, etc.
  private readonly _geometryCache: Map<string, ICachedGeometry>;
  private _imageCacheSize: number;
  private _volumeCacheSize: number;
  private _maxCacheSize: number;

  constructor() {
    // used to store image data (2d)
    this._imageCache = new Map();
    // used to store volume data (3d)
    this._volumeCache = new Map();
    // used to store object data (contour, surface, etc.)
    this._geometryCache = new Map();
    this._imageCacheSize = 0;
    this._volumeCacheSize = 0;
    this._maxCacheSize = MAX_CACHE_SIZE_1GB; // Default 1GB
  }

  /**
   * Set the maximum cache Size
   *
   * Maximum cache size should be set before adding the data; otherwise, it
   * will throw an error.
   *
   * @param newMaxCacheSize -  new maximum cache size
   *
   */
  public setMaxCacheSize = (newMaxCacheSize: number): void => {
    if (!newMaxCacheSize || typeof newMaxCacheSize !== 'number') {
      const errorMessage = `New max cacheSize ${this._maxCacheSize} should be defined and should be a number.`;
      throw new Error(errorMessage);
    }

    this._maxCacheSize = newMaxCacheSize;
  };

  /**
   * Checks if there is enough space in the cache for requested byte size
   *
   * It throws error, if the sum of volatile (image) cache and unallocated cache
   * is less than the requested byteLength
   *
   * @param byteLength - byte length of requested byte size
   *
   * @returns - boolean indicating if there is enough space in the cache
   */
  public isCacheable = (byteLength: number): boolean => {
    const unallocatedSpace = this.getBytesAvailable();
    const imageCacheSize = this._imageCacheSize;
    const availableSpace = unallocatedSpace + imageCacheSize;

    return availableSpace > byteLength;
  };

  /**
   * Returns maximum CacheSize allowed
   *
   * @returns maximum allowed cache size
   */
  public getMaxCacheSize = (): number => this._maxCacheSize;

  /**
   * Returns current size of the cache
   *
   * @returns current size of the cache
   */
  public getCacheSize = (): number =>
    this._imageCacheSize + this._volumeCacheSize;

  /**
   * Returns the unallocated size of the cache
   *
   */
  public getBytesAvailable(): number {
    return this.getMaxCacheSize() - this.getCacheSize();
  }

  /**
   * Deletes the imageId from the image cache
   *
   * @param imageId - imageId
   *
   */
  private _decacheImage = (imageId: string) => {
    const { imageLoadObject } = this._imageCache.get(imageId);

    // Cancel any in-progress loading
    if (imageLoadObject.cancelFn) {
      imageLoadObject.cancelFn();
    }

    if (imageLoadObject.decache) {
      imageLoadObject.decache();
    }

    this._imageCache.delete(imageId);
  };

  /**
   * Deletes the volumeId from the volume cache
   *
   * @param volumeId - volumeId
   *
   */
  private _decacheVolume = (volumeId: string) => {
    const cachedVolume = this._volumeCache.get(volumeId);
    const { volumeLoadObject, volume } = cachedVolume;

    if (volume.cancelLoading) {
      volume.cancelLoading();
    }

    if (volume.imageData) {
      volume.imageData = null;
    }

    if (volumeLoadObject.cancelFn) {
      // Cancel any in-progress loading
      volumeLoadObject.cancelFn();
    }

    if (volumeLoadObject.decache) {
      volumeLoadObject.decache();
    }

    this._volumeCache.delete(volumeId);
  };

  /**
   * Deletes all the images and volumes in the cache
   *
   * Relevant events are fired for each decached image (IMAGE_CACHE_IMAGE_REMOVED) and
   * the decached volume (VOLUME_CACHE_VOLUME_REMOVED).
   *
   * @fires Events.IMAGE_CACHE_IMAGE_REMOVED
   * @fires Events.VOLUME_CACHE_VOLUME_REMOVED
   *
   */
  public purgeCache = (): void => {
    const imageIterator = this._imageCache.keys();

    /* eslint-disable no-constant-condition */
    while (true) {
      const { value: imageId, done } = imageIterator.next();

      if (done) {
        break;
      }

      this.removeImageLoadObject(imageId);

      triggerEvent(eventTarget, Events.IMAGE_CACHE_IMAGE_REMOVED, { imageId });
    }

    this.purgeVolumeCache();
  };

  /**
   * Deletes all the volumes in the cache
   */
  public purgeVolumeCache = (): void => {
    const volumeIterator = this._volumeCache.keys();

    /* eslint-disable no-constant-condition */
    while (true) {
      const { value: volumeId, done } = volumeIterator.next();

      if (done) {
        break;
      }

      this.removeVolumeLoadObject(volumeId);

      triggerEvent(eventTarget, Events.VOLUME_CACHE_VOLUME_REMOVED, {
        volumeId,
      });
    }
  };

  /**
   * Purges the cache if necessary based on the requested number of bytes
   *
   * 1) it sorts the volatile (image) cache based on the most recent used images
   * and starts purging from the oldest ones.
   * Note: for a volume, if the volume-related image Ids is provided, it starts
   * by purging the none-related image Ids (those that are not related to the
   * current volume)
   * 2) For a volume, if we purge all images that won't be included in this volume and still
   * don't have enough unallocated space, purge images that will be included
   * in this volume until we have enough space. These will need to be
   * re-fetched, but we must do this not to straddle over the given memory
   * limit, even for a short time, as this may crash the application.
   *
   * @fires Events.IMAGE_CACHE_IMAGE_REMOVED
   *
   * @param numBytes - Number of bytes for the image/volume that is
   * going to be stored inside the cache
   * @param volumeImageIds - list of imageIds that correspond to the
   * volume whose numberOfBytes we want to store in the cache.
   * @returns bytesAvailable or undefined in purging cache
   * does not successfully make enough space for the requested number of bytes
   */
  public decacheIfNecessaryUntilBytesAvailable(
    numBytes: number,
    volumeImageIds?: Array<string>
  ): number | undefined {
    let bytesAvailable = this.getBytesAvailable();

    // If max cache size has not been exceeded, do nothing
    if (bytesAvailable >= numBytes) {
      return bytesAvailable;
    }

    let cachedImages = Array.from(this._imageCache.values());

    // Cache size has been exceeded, create list of images sorted by timeStamp
    // So we can purge the least recently used image
    function compare(a, b) {
      if (a.timeStamp > b.timeStamp) {
        return 1;
      }
      if (a.timeStamp < b.timeStamp) {
        return -1;
      }

      return 0;
    }

    cachedImages.sort(compare);
    let cachedImageIds = cachedImages.map((im) => im.imageId);

    let imageIdsToPurge = cachedImageIds;

    // if we are making space for a volume, we start by purging the imageIds
    // that are not related to the volume
    if (volumeImageIds) {
      imageIdsToPurge = cachedImageIds.filter(
        (id) => !volumeImageIds.includes(id)
      );
    }

    // Remove images (that are not related to the volume) from volatile cache
    // until the requested number of bytes become available
    for (const imageId of imageIdsToPurge) {
      this.removeImageLoadObject(imageId);

      triggerEvent(eventTarget, Events.IMAGE_CACHE_IMAGE_REMOVED, { imageId });

      bytesAvailable = this.getBytesAvailable();
      if (bytesAvailable >= numBytes) {
        return bytesAvailable;
      }
    }

    // Remove the imageIds (both volume related and not related)
    cachedImages = Array.from(this._imageCache.values());
    cachedImageIds = cachedImages.map((im) => im.imageId);

    // Remove volume-image Ids from volatile cache until the requested number of bytes
    // become available
    for (const imageId of cachedImageIds) {
      this.removeImageLoadObject(imageId);

      triggerEvent(eventTarget, Events.IMAGE_CACHE_IMAGE_REMOVED, { imageId });

      bytesAvailable = this.getBytesAvailable();
      if (bytesAvailable >= numBytes) {
        return bytesAvailable;
      }
    }

    // Technically we should not reach here, since isCacheable will throw an
    // error if unallocated + volatile (image) cache cannot fit the upcoming
    // number of bytes
  }

  /**
   * Puts a new image load object into the cache
   *
   * First, it creates a CachedImage object and put it inside the imageCache for
   * the imageId. After the imageLoadObject promise resolves to an image,
   * it: 1) adds the image into the correct CachedImage object 2) increments the
   * cache size, 3) triggers IMAGE_CACHE_IMAGE_ADDED  4) Purge the cache if
   * necessary -- if the cache size is greater than the maximum cache size, it
   * iterates over the imageCache and decache them one by one until the cache
   * size becomes less than the maximum allowed cache size
   *
   * @fires Events.IMAGE_CACHE_IMAGE_ADDED
   * @fires Events.CACHE_SIZE_EXCEEDED if the cache size exceeds the maximum
   *
   * @param imageId - ImageId for the image
   * @param imageLoadObject - The object that is loading or loaded the image
   */
  public putImageLoadObject(
    imageId: string,
    imageLoadObject: IImageLoadObject
  ): Promise<any> {
    if (imageId === undefined) {
      throw new Error('putImageLoadObject: imageId must not be undefined');
    }

    if (imageLoadObject.promise === undefined) {
      throw new Error(
        'putImageLoadObject: imageLoadObject.promise must not be undefined'
      );
    }

    if (this._imageCache.has(imageId)) {
      throw new Error('putImageLoadObject: imageId already in cache');
    }

    if (
      imageLoadObject.cancelFn &&
      typeof imageLoadObject.cancelFn !== 'function'
    ) {
      throw new Error(
        'putImageLoadObject: imageLoadObject.cancel must be a function'
      );
    }

    const cachedImage: ICachedImage = {
      loaded: false,
      imageId,
      sharedCacheKey: undefined, // The sharedCacheKey for this imageId.  undefined by default
      imageLoadObject,
      timeStamp: Date.now(),
      sizeInBytes: 0,
    };

    this._imageCache.set(imageId, cachedImage);

    return imageLoadObject.promise
      .then((image: IImage) => {
        if (!this._imageCache.get(imageId)) {
          // If the image has been purged before being loaded, we stop here.
          console.warn(
            'The image was purged from the cache before it completed loading.'
          );
          return;
        }

        if (Number.isNaN(image.sizeInBytes)) {
          throw new Error(
            'putImageLoadObject: image.sizeInBytes must not be undefined'
          );
        }
        if (image.sizeInBytes.toFixed === undefined) {
          throw new Error(
            'putImageLoadObject: image.sizeInBytes is not a number'
          );
        }

        // check if there is enough space in unallocated + image Cache
        if (!this.isCacheable(image.sizeInBytes)) {
          throw new Error(Events.CACHE_SIZE_EXCEEDED);
        }

        // if there is, decache if necessary
        this.decacheIfNecessaryUntilBytesAvailable(image.sizeInBytes);

        cachedImage.loaded = true;
        cachedImage.image = image;
        cachedImage.sizeInBytes = image.sizeInBytes;
        this._incrementImageCacheSize(cachedImage.sizeInBytes);

        const eventDetails: EventTypes.ImageCacheImageAddedEventDetail = {
          image: cachedImage,
        };

        triggerEvent(eventTarget, Events.IMAGE_CACHE_IMAGE_ADDED, eventDetails);

        cachedImage.sharedCacheKey = image.sharedCacheKey;
      })
      .catch((error) => {
        // console.warn(error)
        this._imageCache.delete(imageId);
        throw error;
      });
  }

  /**
   * Returns the object that is loading a given imageId
   *
   * @param imageId - Image ID
   * @returns IImageLoadObject
   */
  public getImageLoadObject(imageId: string): IImageLoadObject {
    if (imageId === undefined) {
      throw new Error('getImageLoadObject: imageId must not be undefined');
    }
    const cachedImage = this._imageCache.get(imageId);

    if (cachedImage === undefined) {
      return;
    }

    // Bump time stamp for cached image
    cachedImage.timeStamp = Date.now();

    return cachedImage.imageLoadObject;
  }

  /**
   * It checks the imageCache for the provided imageId, and returns true
   * if the image is loaded, false otherwise. Note, this only checks the imageCache
   * and does not check the volume cache.
   * @param imageId - image Id to check
   * @returns boolean
   */
  public isImageIdCached(imageId: string): boolean {
    const cachedImage = this._imageCache.get(imageId);

    if (!cachedImage) {
      return false;
    }

    return cachedImage.loaded;
  }

  /**
   * Returns the volume that contains the requested imageId. It will check the
   * imageIds inside the volume to find a match.
   *
   * @param imageId - ImageId
   * @returns - Volume object
   */
  public getVolumeContainingImageId(imageId: string): {
    volume: IImageVolume;
    imageIdIndex: number;
  } {
    const volumeIds = Array.from(this._volumeCache.keys());
    const imageIdToUse = imageIdToURI(imageId);

    for (const volumeId of volumeIds) {
      const cachedVolume = this._volumeCache.get(volumeId);

      if (!cachedVolume.volume) {
        return;
      }

      let { imageIds } = cachedVolume.volume;

      if (!imageIds || imageIds.length === 0) {
        continue;
      }

      imageIds = imageIds.map((id) => imageIdToURI(id));

      const imageIdIndex = imageIds.indexOf(imageIdToUse);
      if (imageIdIndex > -1) {
        return { volume: cachedVolume.volume, imageIdIndex };
      }
    }
  }

  /**
   * Returns the cached image from the imageCache for the requested imageId.
   * It first strips the imageId to remove the data loading scheme.
   *
   * @param imageId - Image ID
   * @returns cached image
   */
  public getCachedImageBasedOnImageURI(
    imageId: string
  ): ICachedImage | undefined {
    const imageURIToUse = imageIdToURI(imageId);

    const cachedImageIds = Array.from(this._imageCache.keys());
    const foundImageId = cachedImageIds.find((imageId) => {
      return imageIdToURI(imageId) === imageURIToUse;
    });

    if (!foundImageId) {
      return;
    }

    return this._imageCache.get(foundImageId);
  }
  /**
   * Puts a new image load object into the cache
   *
   * First, it creates a CachedVolume object and put it inside the volumeCache for
   * the volumeId. After the volumeLoadObject promise resolves to a volume,
   * it: 1) adds the volume into the correct CachedVolume object inside volumeCache
   * 2) increments the cache size, 3) triggers VOLUME_CACHE_VOLUME_ADDED  4) Purge
   * the cache if necessary -- if the cache size is greater than the maximum cache size, it
   * iterates over the imageCache (not volumeCache) and decache them one by one
   * until the cache size becomes less than the maximum allowed cache size
   *
   * @fires Events.VOLUME_CACHE_VOLUME_ADDED
   *
   * @param volumeId - volumeId of the volume
   * @param volumeLoadObject - The object that is loading or loaded the volume
   */
  public putVolumeLoadObject(
    volumeId: string,
    volumeLoadObject: IVolumeLoadObject
  ): Promise<any> {
    if (volumeId === undefined) {
      throw new Error('putVolumeLoadObject: volumeId must not be undefined');
    }
    if (volumeLoadObject.promise === undefined) {
      throw new Error(
        'putVolumeLoadObject: volumeLoadObject.promise must not be undefined'
      );
    }
    if (this._volumeCache.has(volumeId)) {
      throw new Error(
        `putVolumeLoadObject: volumeId:${volumeId} already in cache`
      );
    }
    if (
      volumeLoadObject.cancelFn &&
      typeof volumeLoadObject.cancelFn !== 'function'
    ) {
      throw new Error(
        'putVolumeLoadObject: volumeLoadObject.cancel must be a function'
      );
    }

    // todo: @Erik there are two loaded flags, one inside cachedVolume and the other
    // inside the volume.loadStatus.loaded, the actual all pixelData loaded is the
    // loadStatus one. This causes confusion
    const cachedVolume: ICachedVolume = {
      loaded: false,
      volumeId,
      volumeLoadObject,
      timeStamp: Date.now(),
      sizeInBytes: 0,
    };

    this._volumeCache.set(volumeId, cachedVolume);

    return volumeLoadObject.promise
      .then((volume: IImageVolume) => {
        if (!this._volumeCache.get(volumeId)) {
          // If the image has been purged before being loaded, we stop here.
          console.warn(
            'The image was purged from the cache before it completed loading.'
          );
          return;
        }

        if (Number.isNaN(volume.sizeInBytes)) {
          throw new Error(
            'putVolumeLoadObject: volume.sizeInBytes must not be undefined'
          );
        }
        if (volume.sizeInBytes.toFixed === undefined) {
          throw new Error(
            'putVolumeLoadObject: volume.sizeInBytes is not a number'
          );
        }

        // this.isCacheable is called at the volume loader, before requesting
        // the images of the volume

        this.decacheIfNecessaryUntilBytesAvailable(
          volume.sizeInBytes,
          // @ts-ignore: // todo ImageVolume does not have imageIds
          volume.imageIds
        );

        // cachedVolume.loaded = true
        cachedVolume.volume = volume;
        cachedVolume.sizeInBytes = volume.sizeInBytes;
        this._incrementVolumeCacheSize(cachedVolume.sizeInBytes);

        const eventDetails: EventTypes.VolumeCacheVolumeAddedEventDetail = {
          volume: cachedVolume,
        };

        triggerEvent(
          eventTarget,
          Events.VOLUME_CACHE_VOLUME_ADDED,
          eventDetails
        );
      })
      .catch((error) => {
        this._volumeCache.delete(volumeId);
        throw error;
      });
  }

  /**
   * Returns the object that is loading a given volumeId
   *
   * @param volumeId - Volume ID
   * @returns IVolumeLoadObject
   */
  public getVolumeLoadObject = (volumeId: string): IVolumeLoadObject => {
    if (volumeId === undefined) {
      throw new Error('getVolumeLoadObject: volumeId must not be undefined');
    }
    const cachedVolume = this._volumeCache.get(volumeId);

    if (cachedVolume === undefined) {
      return;
    }

    // Bump time stamp for cached volume (not used for anything for now)
    cachedVolume.timeStamp = Date.now();

    return cachedVolume.volumeLoadObject;
  };

  public getGeometry = (geometryId: string): IGeometry => {
    if (geometryId == null) {
      throw new Error('getGeometry: geometryId must not be undefined');
    }

    const cachedGeometry = this._geometryCache.get(geometryId);

    if (cachedGeometry === undefined) {
      return;
    }

    // Bump time stamp for cached geometry (not used for anything for now)
    cachedGeometry.timeStamp = Date.now();

    return cachedGeometry.geometry;
  };

  /**
   * Returns the volume associated with the volumeId
   *
   * @param volumeId - Volume ID
   * @returns Volume
   */
  public getVolume = (volumeId: string): IImageVolume => {
    if (volumeId === undefined) {
      throw new Error('getVolume: volumeId must not be undefined');
    }
    const cachedVolume = this._volumeCache.get(volumeId);

    if (cachedVolume === undefined) {
      return;
    }

    // Bump time stamp for cached volume (not used for anything for now)
    cachedVolume.timeStamp = Date.now();

    return cachedVolume.volume;
  };

  /**
   * Removes the image loader associated with a given Id from the cache
   *
   * It increases the cache size after removing the image.
   *
   * @fires Events.IMAGE_CACHE_IMAGE_REMOVED
   *
   * @param imageId - Image ID
   */
  public removeImageLoadObject = (imageId: string): void => {
    if (imageId === undefined) {
      throw new Error('removeImageLoadObject: imageId must not be undefined');
    }
    const cachedImage = this._imageCache.get(imageId);

    if (cachedImage === undefined) {
      throw new Error(
        'removeImageLoadObject: imageId was not present in imageCache'
      );
    }

    this._incrementImageCacheSize(-cachedImage.sizeInBytes);

    const eventDetails = {
      imageId,
    };

    triggerEvent(eventTarget, Events.IMAGE_CACHE_IMAGE_REMOVED, eventDetails);
    this._decacheImage(imageId);
  };

  /**
   * Removes the volume loader associated with a given Id from the cache
   *
   * It increases the cache size after removing the image.
   *
   * @fires Events.VOLUME_CACHE_VOLUME_REMOVED
   *
   * @param imageId - ImageId
   */
  public removeVolumeLoadObject = (volumeId: string): void => {
    if (volumeId === undefined) {
      throw new Error('removeVolumeLoadObject: volumeId must not be undefined');
    }
    const cachedVolume = this._volumeCache.get(volumeId);

    if (cachedVolume === undefined) {
      throw new Error(
        'removeVolumeLoadObject: volumeId was not present in volumeCache'
      );
    }

    this._incrementVolumeCacheSize(-cachedVolume.sizeInBytes);

    const eventDetails = {
      volume: cachedVolume,
      volumeId,
    };

    triggerEvent(eventTarget, Events.VOLUME_CACHE_VOLUME_REMOVED, eventDetails);
    this._decacheVolume(volumeId);
  };

  putGeometryLoadObject = (
    geometryId: string,
    geometryLoadObject: IGeometryLoadObject
  ): Promise<void> => {
    if (geometryId == undefined) {
      throw new Error(
        'putGeometryLoadObject: geometryId must not be undefined'
      );
    }

    if (this._geometryCache.has(geometryId)) {
      throw new Error(
        'putGeometryLoadObject: geometryId already present in geometryCache'
      );
    }

    const cachedGeometry: ICachedGeometry = {
      geometryId,
      geometryLoadObject,
      loaded: false,
      timeStamp: Date.now(),
      sizeInBytes: 0,
    };

    this._geometryCache.set(geometryId, cachedGeometry);

    return geometryLoadObject.promise
      .then((geometry: IGeometry) => {
        if (!this._geometryCache.has(geometryId)) {
          console.warn(
            'putGeometryLoadObject: geometryId was removed from geometryCache'
          );
          return;
        }

        if (Number.isNaN(geometry.sizeInBytes)) {
          throw new Error(
            'putGeometryLoadObject: geometry.sizeInBytes is not a number'
          );
        }

        // Todo: fix is cacheable

        cachedGeometry.loaded = true;
        cachedGeometry.geometry = geometry;
        cachedGeometry.sizeInBytes = geometry.sizeInBytes;

        // this._incrementGeometryCacheSize(geometry.sizeInBytes);

        const eventDetails = {
          geometry,
          geometryId,
        };

        triggerEvent(
          eventTarget,
          Events.GEOMETRY_CACHE_GEOMETRY_ADDED,
          eventDetails
        );

        return;
      })
      .catch((error) => {
        this._geometryCache.delete(geometryId);
        throw error;
      });
  };

  /**
   * Increases the image cache size with the provided increment
   *
   * @param increment - bytes length
   */
  private _incrementImageCacheSize = (increment: number) => {
    this._imageCacheSize += increment;
  };

  /**
   * Increases the cache size with the provided increment
   *
   * @param increment - bytes length
   */
  private _incrementVolumeCacheSize = (increment: number) => {
    this._volumeCacheSize += increment;
  };
}

/**
 * This module deals with Caching of images and volumes
 * The cache has two main components: a volatile portion for images and a
 * non-volatile portion for volumes. Individual 2D images are volatile and
 * will be replaced by new images hitting the cache. When you allocate volumes,
 * these are non-volatile and reserve a block of memory from the cache.
 * Volumes must be released manually.
 * We will have a shared block of memory allocated for the entire cache, e.g. 1GB
 * which will be shared for images and volumes.
 *
 * **When a new image is added:**
 * We check if there is enough unallocated + volatile space for the single image
 *
 * if so
 * - We allocate the image in image cache, and if necessary oldest images
 * are decached to match the maximumCacheSize criteria
 * - If a volume contains that imageId, copy it over using TypedArray's set method.
 * If no volumes contain the imageId, the image is fetched by image loaders
 *
 * If not (cache is mostly/completely full with volumes)
 * - throw that the cache does not have enough working space to allocate the image
 *
 *
 * **When a new volume is added:**
 * Check if there is enough unallocated + volatile space to allocate the volume:
 *
 * If so:
 * - Decache oldest images which won't be included in this volume until
 * we have enough free space for the volume
 * - If not enough space from previous space, decache images that will be included
 * in the volume until we have enough free space (These will need to be re-fetched,
 * but we must do this not to straddle over the given memory limit, even for a
 * short time, as this may crash the app)
 * - At this point, if any of the frames (indexed by imageId) are present in the volatile
 * image cache, copy these over to the volume now
 *
 * If not (cache is mostly/completely full with volumes),
 * - throw that the cache does not have enough working space to allocate the volume.
 *
 */
const cache = new Cache();
export default cache;
export { Cache }; // for documentation
