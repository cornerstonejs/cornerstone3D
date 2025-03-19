import type {
  ICache,
  IImage,
  IGeometry,
  IImageLoadObject,
  IVolumeLoadObject,
  IGeometryLoadObject,
  ICachedImage,
  ICachedVolume,
  ICachedGeometry,
  EventTypes,
  IImageVolume,
} from '../types';
import triggerEvent from '../utilities/triggerEvent';
import imageIdToURI from '../utilities/imageIdToURI';
import eventTarget from '../eventTarget';
import Events from '../enums/Events';
import { ImageQualityStatus } from '../enums';
import fnv1aHash from '../utilities/fnv1aHash';

const ONE_GB = 1073741824;

/**
 * Stores images, volumes and geometry.
 * There are two sizes - the max cache size, that controls the overall maximum
 * size, and the instance size, which controls how big any single object can
 * be.  Defaults are 3 GB and 2 GB - 8 bytes (just enough to allow allocating it
 * without crashing).
 * The 3 gb is tuned to the chromium garbage collection cycle to allow image volumes
 * to be used/discarded.
 */
class Cache {
  // used to store image data (2d)
  private readonly _imageCache = new Map<string, ICachedImage>();
  // used to store volume data (3d)
  private readonly _volumeCache = new Map<string, ICachedVolume>();
  // used to store the reverse lookup from imageIds to volumeId
  private readonly _imageIdsToVolumeIdCache = new Map<string, string>();
  // Todo: contour for now, but will be used for surface, etc.
  private readonly _geometryCache = new Map<string, ICachedGeometry>();

  private _imageCacheSize = 0;
  private _maxCacheSize = 3 * ONE_GB;
  private _geometryCacheSize = 0;

  /**
   * Generates a deterministic volume ID from a list of image IDs
   * @param imageIds - Array of image IDs
   * @returns A deterministic volume ID
   */
  public generateVolumeId(imageIds: string[]): string {
    const imageURIs = imageIds.map(imageIdToURI).sort();

    let combinedHash = 0x811c9dc5;
    for (const id of imageURIs) {
      const idHash = fnv1aHash(id);
      for (let i = 0; i < idHash.length; i++) {
        combinedHash ^= idHash.charCodeAt(i);
        combinedHash +=
          (combinedHash << 1) +
          (combinedHash << 4) +
          (combinedHash << 7) +
          (combinedHash << 8) +
          (combinedHash << 24);
      }
    }
    return `volume-${(combinedHash >>> 0).toString(36)}`;
  }

  public getImageIdsForVolumeId(volumeId: string): string[] {
    return Array.from(this._imageIdsToVolumeIdCache.entries())
      .filter(([_, id]) => id === volumeId)
      .map(([key]) => key);
  }

  /**
   * Set the maximum cache Size
   *
   * Maximum cache size should be set before adding the data.  If set after,
   * and it is smaller than the current size, will cause issues.
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
   * Determines if the cache can accommodate the requested byte size.
   *
   * This method calculates the available space by considering both unallocated space
   * and the potential space that can be freed by purging non-shared images.
   * It returns true if this available space exceeds the requested byteLength.
   *
   * @param byteLength - The number of bytes to be cached.
   * @returns {boolean} True if the cache can accommodate the requested size, false otherwise.
   */
  public isCacheable = (byteLength) => {
    const bytesAvailable = this.getBytesAvailable();

    const purgableImageBytes = Array.from(this._imageCache.values()).reduce(
      (total, image) => {
        if (!image.sharedCacheKey) {
          return total + image.sizeInBytes;
        }
        return total;
      },
      0
    );

    const availableSpaceWithoutSharedCacheKey =
      bytesAvailable + purgableImageBytes;

    return availableSpaceWithoutSharedCacheKey >= byteLength;
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
  public getCacheSize = (): number => this._imageCacheSize;

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
   * @throws Error if the image is part of a shared cache key
   */
  private _decacheImage = (imageId: string, force = false) => {
    const cachedImage = this._imageCache.get(imageId);

    if (!cachedImage) {
      return;
    }

    if (cachedImage.sharedCacheKey && !force) {
      throw new Error(
        'Cannot decache an image with a shared cache key. You need to manually decache the volume first.'
      );
    }

    const { imageLoadObject } = cachedImage;

    // Cancel any in-progress loading
    if (imageLoadObject?.cancelFn) {
      imageLoadObject.cancelFn();
    }

    if (imageLoadObject?.decache) {
      imageLoadObject.decache();
    }

    this._imageCache.delete(imageId);
  };

  /**
   * Deletes the volumeId from the volume cache and removes shared cache keys for its images
   *
   * @param volumeId - volumeId
   *
   */
  private _decacheVolume = (volumeId: string) => {
    const cachedVolume = this._volumeCache.get(volumeId);

    if (!cachedVolume) {
      return;
    }

    const { volumeLoadObject, volume } = cachedVolume;

    if (!volume) {
      return;
    }

    if (volume.cancelLoading) {
      volume.cancelLoading();
    }

    if (volume.imageData) {
      volume.imageData.delete();
    }

    if (volumeLoadObject.cancelFn) {
      // Cancel any in-progress loading
      volumeLoadObject.cancelFn();
    }

    // Remove shared cache keys for the volume's images
    if (volume.imageIds) {
      volume.imageIds.forEach((imageId) => {
        const cachedImage = this._imageCache.get(imageId);
        if (cachedImage && cachedImage.sharedCacheKey === volumeId) {
          cachedImage.sharedCacheKey = undefined;
        }
      });
    }

    this._volumeCache.delete(volumeId);
  };

  /**
   * Deletes all the images and volumes in the cache
   *
   * Relevant events are fired for each decached image (IMAGE_CACHE_IMAGE_REMOVED) and
   * the decached volume (VOLUME_CACHE_VOLUME_REMOVED).
   *
   *
   */
  public purgeCache = (): void => {
    const imageIterator = this._imageCache.keys();

    // need to purge volume cache first to avoid issues with image cache
    // shared cache keys
    this.purgeVolumeCache();

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { value: imageId, done } = imageIterator.next();

      if (done) {
        break;
      }

      this.removeImageLoadObject(imageId, { force: true });

      triggerEvent(eventTarget, Events.IMAGE_CACHE_IMAGE_REMOVED, { imageId });
    }
  };

  /**
   * Deletes all the volumes in the cache
   */
  public purgeVolumeCache = (): void => {
    const volumeIterator = this._volumeCache.keys();

    // eslint-disable-next-line no-constant-condition
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
   * fires Events.IMAGE_CACHE_IMAGE_REMOVED
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
    volumeImageIds?: string[]
  ): number | undefined {
    let bytesAvailable = this.getBytesAvailable();

    // If max cache size has not been exceeded, do nothing
    if (bytesAvailable >= numBytes) {
      return bytesAvailable;
    }

    const cachedImages = Array.from(this._imageCache.values()).filter(
      (cachedImage) => !cachedImage.sharedCacheKey
    );

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
    const cachedImageIds = cachedImages.map((im) => im.imageId);

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
   * Common logic for putting an image into the cache
   *
   * @param imageId - ImageId for the image
   * @param image - The loaded image
   * @param cachedImage - The CachedImage object
   */
  private _putImageCommon(
    imageId: string,
    image: IImage,
    cachedImage: ICachedImage
  ): void {
    if (!this._imageCache.has(imageId)) {
      console.warn(
        'The image was purged from the cache before it completed loading.'
      );
      return;
    }

    if (!image) {
      console.warn('Image is undefined');
      return;
    }

    if (image.sizeInBytes === undefined || Number.isNaN(image.sizeInBytes)) {
      throw new Error(
        '_putImageCommon: image.sizeInBytes must not be undefined'
      );
    }
    if (image.sizeInBytes.toFixed === undefined) {
      throw new Error('_putImageCommon: image.sizeInBytes is not a number');
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
    this.incrementImageCacheSize(cachedImage.sizeInBytes);
    const eventDetails: EventTypes.ImageCacheImageAddedEventDetail = {
      image: cachedImage,
    };

    triggerEvent(eventTarget, Events.IMAGE_CACHE_IMAGE_ADDED, eventDetails);

    cachedImage.sharedCacheKey = image.sharedCacheKey;
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
   * fires Events.IMAGE_CACHE_IMAGE_ADDED
   * fires Events.CACHE_SIZE_EXCEEDED if the cache size exceeds the maximum
   *
   * @param imageId - ImageId for the image
   * @param imageLoadObject - The object that is loading or loaded the image
   */
  public async putImageLoadObject(
    imageId: string,
    imageLoadObject: IImageLoadObject
  ): Promise<void> {
    if (imageId === undefined) {
      console.error('putImageLoadObject: imageId must not be undefined');
      throw new Error('putImageLoadObject: imageId must not be undefined');
    }

    if (imageLoadObject.promise === undefined) {
      console.error(
        'putImageLoadObject: imageLoadObject.promise must not be undefined'
      );
      throw new Error(
        'putImageLoadObject: imageLoadObject.promise must not be undefined'
      );
    }

    const alreadyCached = this._imageCache.get(imageId);
    if (alreadyCached?.imageLoadObject) {
      console.warn(`putImageLoadObject: imageId ${imageId} already in cache`);
      throw new Error('putImageLoadObject: imageId already in cache');
    }

    if (
      imageLoadObject.cancelFn &&
      typeof imageLoadObject.cancelFn !== 'function'
    ) {
      console.error(
        'putImageLoadObject: imageLoadObject.cancel must be a function'
      );
      throw new Error(
        'putImageLoadObject: imageLoadObject.cancel must be a function'
      );
    }

    // Starts with an existing cached image and extend it with information
    // about being loaded.
    const cachedImage: ICachedImage = {
      ...alreadyCached,
      loaded: false,
      imageId,
      sharedCacheKey: undefined,
      imageLoadObject,
      timeStamp: Date.now(),
      sizeInBytes: 0,
    };

    this._imageCache.set(imageId, cachedImage);

    // For some reason we need to put it here after the rework of volumes
    this._imageCache.set(imageId, cachedImage);

    return imageLoadObject.promise
      .then((image: IImage) => {
        try {
          this._putImageCommon(imageId, image, cachedImage);
        } catch (error) {
          console.debug(
            `Error in _putImageCommon for image ${imageId}:`,
            error
          );
          throw error; // Re-throw the error to be caught in the .catch block
        }
      })
      .catch((error) => {
        console.debug(`Error caching image ${imageId}:`, error);
        this._imageCache.delete(imageId);
        throw error; // Re-throw the error to be caught by the caller
      });
  }

  /**
   * Puts a new image directly into the cache (synchronous version)
   *
   * @param imageId - ImageId for the image
   * @param image - The loaded image
   */
  public putImageSync(imageId: string, image: IImage): void {
    if (imageId === undefined) {
      throw new Error('putImageSync: imageId must not be undefined');
    }

    if (this._imageCache.has(imageId)) {
      throw new Error('putImageSync: imageId already in cache');
    }

    const cachedImage: ICachedImage = {
      loaded: false,
      imageId,
      sharedCacheKey: undefined,
      imageLoadObject: {
        promise: Promise.resolve(image),
      },
      timeStamp: Date.now(),
      sizeInBytes: 0,
    };

    this._imageCache.set(imageId, cachedImage);

    try {
      this._putImageCommon(imageId, image, cachedImage);
    } catch (error) {
      this._imageCache.delete(imageId);
      throw error;
    }
  }

  /**
   * Returns the object that is loading a given imageId
   *
   * @param imageId - Image ID
   * @returns IImageLoadObject
   */
  public getImageLoadObject(imageId: string): IImageLoadObject | undefined {
    if (imageId === undefined) {
      throw new Error('getImageLoadObject: imageId must not be undefined');
    }

    const cachedImage = this._imageCache.get(imageId);
    if (!cachedImage) {
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
  public isLoaded(imageId: string): boolean {
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
  public getVolumeContainingImageId(imageId: string):
    | {
        volume: IImageVolume;
        imageIdIndex: number;
      }
    | undefined {
    const volumeIds = Array.from(this._volumeCache.keys());
    const imageIdToUse = imageIdToURI(imageId);

    for (const volumeId of volumeIds) {
      const cachedVolume = this._volumeCache.get(volumeId);

      if (!cachedVolume) {
        return;
      }

      const { volume } = cachedVolume;

      if (!volume.imageIds.length) {
        return;
      }

      const imageIdIndex = volume.getImageURIIndex(imageIdToUse);

      if (imageIdIndex > -1) {
        return { volume, imageIdIndex };
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
   * Common logic for putting a volume into the cache
   *
   * @param volumeId - VolumeId for the volume
   * @param volume - The loaded volume
   * @param cachedVolume - The CachedVolume object
   */
  private _putVolumeCommon(
    volumeId: string,
    volume: IImageVolume,
    cachedVolume: ICachedVolume
  ): void {
    if (!this._volumeCache.get(volumeId)) {
      console.warn(
        'The volume was purged from the cache before it completed loading.'
      );
      return;
    }

    cachedVolume.loaded = true;
    cachedVolume.volume = volume;

    // If the volume has image IDs, we need to make sure that they are not getting
    // deleted automatically.  Mark the imageIds somehow so that they are discernable from the others.
    volume.imageIds?.forEach((imageId) => {
      const image = this._imageCache.get(imageId);
      if (image) {
        image.sharedCacheKey = volumeId;
      }
    });

    const eventDetails: EventTypes.VolumeCacheVolumeAddedEventDetail = {
      volume: cachedVolume,
    };

    triggerEvent(eventTarget, Events.VOLUME_CACHE_VOLUME_ADDED, eventDetails);
  }

  /**
   * Puts a new volume directly into the cache (synchronous version)
   *
   * @param volumeId - VolumeId for the volume
   * @param volume - The loaded volume
   */
  public putVolumeSync(volumeId: string, volume: IImageVolume): void {
    if (volumeId === undefined) {
      throw new Error('putVolumeSync: volumeId must not be undefined');
    }

    if (this._volumeCache.has(volumeId)) {
      throw new Error('putVolumeSync: volumeId already in cache');
    }

    const cachedVolume: ICachedVolume = {
      loaded: false,
      volumeId,
      volumeLoadObject: {
        promise: Promise.resolve(volume),
      },
      timeStamp: Date.now(),
      sizeInBytes: 0,
    };

    this._volumeCache.set(volumeId, cachedVolume);

    try {
      this._putVolumeCommon(volumeId, volume, cachedVolume);
    } catch (error) {
      this._volumeCache.delete(volumeId);
      throw error;
    }
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
   * fires Events.VOLUME_CACHE_VOLUME_ADDED
   *
   * @param volumeId - volumeId of the volume
   * @param volumeLoadObject - The object that is loading or loaded the volume
   */
  public async putVolumeLoadObject(
    volumeId: string,
    volumeLoadObject: IVolumeLoadObject
  ): Promise<void> {
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
        try {
          this._putVolumeCommon(volumeId, volume, cachedVolume);
        } catch (error) {
          console.error(
            `Error in _putVolumeCommon for volume ${volumeId}:`,
            error
          );
          this._volumeCache.delete(volumeId); // Clean up the cache if an error occurs
          throw error;
        }
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
  public getVolumeLoadObject = (
    volumeId: string
  ): IVolumeLoadObject | undefined => {
    if (volumeId === undefined) {
      throw new Error('getVolumeLoadObject: volumeId must not be undefined');
    }

    const cachedVolume = this._volumeCache.get(volumeId);

    if (!cachedVolume) {
      return;
    }

    // Bump time stamp for cached volume (not used for anything for now)
    cachedVolume.timeStamp = Date.now();

    return cachedVolume.volumeLoadObject;
  };

  /**
   * Common logic for putting a geometry into the cache
   *
   * @param geometryId - GeometryId for the geometry
   * @param geometry - The loaded geometry
   * @param cachedGeometry - The CachedGeometry object
   */
  private _putGeometryCommon(
    geometryId: string,
    geometry: IGeometry,
    cachedGeometry: ICachedGeometry
  ): void {
    if (!this._geometryCache.get(geometryId)) {
      console.warn(
        'The geometry was purged from the cache before it completed loading.'
      );
      return;
    }

    if (!geometry) {
      console.warn('Geometry is undefined');
      return;
    }

    if (
      geometry.sizeInBytes === undefined ||
      Number.isNaN(geometry.sizeInBytes)
    ) {
      throw new Error(
        '_putGeometryCommon: geometry.sizeInBytes must not be undefined'
      );
    }
    if (geometry.sizeInBytes.toFixed === undefined) {
      throw new Error(
        '_putGeometryCommon: geometry.sizeInBytes is not a number'
      );
    }

    // check if there is enough space in unallocated + geometry Cache
    if (!this.isCacheable(geometry.sizeInBytes)) {
      throw new Error(Events.CACHE_SIZE_EXCEEDED);
    }

    // if there is, decache if necessary
    this.decacheIfNecessaryUntilBytesAvailable(geometry.sizeInBytes);

    cachedGeometry.loaded = true;
    cachedGeometry.geometry = geometry;
    cachedGeometry.sizeInBytes = geometry.sizeInBytes;
    this.incrementGeometryCacheSize(cachedGeometry.sizeInBytes);

    const eventDetails = {
      geometry: cachedGeometry,
    };

    triggerEvent(
      eventTarget,
      Events.GEOMETRY_CACHE_GEOMETRY_ADDED,
      eventDetails
    );
  }

  /**
   * Puts a new geometry directly into the cache (synchronous version)
   *
   * @param geometryId - GeometryId for the geometry
   * @param geometry - The loaded geometry
   */
  public putGeometrySync(geometryId: string, geometry: IGeometry): void {
    if (geometryId === undefined) {
      throw new Error('putGeometrySync: geometryId must not be undefined');
    }

    if (this._geometryCache.has(geometryId)) {
      throw new Error('putGeometrySync: geometryId already in cache');
    }

    const cachedGeometry: ICachedGeometry = {
      loaded: false,
      geometryId,
      geometryLoadObject: {
        promise: Promise.resolve(geometry),
      },
      timeStamp: Date.now(),
      sizeInBytes: 0,
    };

    this._geometryCache.set(geometryId, cachedGeometry);

    try {
      this._putGeometryCommon(geometryId, geometry, cachedGeometry);
    } catch (error) {
      this._geometryCache.delete(geometryId);
      throw error;
    }
  }

  public putGeometryLoadObject = (
    geometryId: string,
    geometryLoadObject: IGeometryLoadObject
  ): Promise<void> => {
    if (geometryId === undefined) {
      throw new Error(
        'putGeometryLoadObject: geometryId must not be undefined'
      );
    }

    if (geometryLoadObject.promise === undefined) {
      throw new Error(
        'putGeometryLoadObject: geometryLoadObject.promise must not be undefined'
      );
    }

    if (this._geometryCache.has(geometryId)) {
      throw new Error(
        'putGeometryLoadObject: geometryId already present in geometryCache'
      );
    }

    if (
      geometryLoadObject.cancelFn &&
      typeof geometryLoadObject.cancelFn !== 'function'
    ) {
      throw new Error(
        'putGeometryLoadObject: geometryLoadObject.cancel must be a function'
      );
    }

    const cachedGeometry: ICachedGeometry = {
      loaded: false,
      geometryId,
      geometryLoadObject,
      timeStamp: Date.now(),
      sizeInBytes: 0,
    };

    this._geometryCache.set(geometryId, cachedGeometry);

    return geometryLoadObject.promise
      .then((geometry: IGeometry) => {
        try {
          this._putGeometryCommon(geometryId, geometry, cachedGeometry);
        } catch (error) {
          console.debug(
            `Error in _putGeometryCommon for geometry ${geometryId}:`,
            error
          );
          throw error;
        }
      })
      .catch((error) => {
        console.debug(`Error caching geometry ${geometryId}:`, error);
        this._geometryCache.delete(geometryId);
        throw error;
      });
  };

  /**
   * Returns the geometry associated with the geometryId
   *
   * @param geometryId - Geometry ID
   * @returns Geometry
   */
  public getGeometry = (geometryId: string): IGeometry | undefined => {
    if (geometryId === undefined) {
      throw new Error('getGeometry: geometryId must not be undefined');
    }

    const cachedGeometry = this._geometryCache.get(geometryId);

    if (!cachedGeometry) {
      return;
    }

    // Bump time stamp for cached geometry
    cachedGeometry.timeStamp = Date.now();

    return cachedGeometry.geometry;
  };

  /**
   * Removes the geometry loader associated with a given Id from the cache
   *
   * It increases the cache size after removing the geometry.
   *
   * fires Events.GEOMETRY_CACHE_GEOMETRY_REMOVED
   *
   * @param geometryId - Geometry ID
   */
  public removeGeometryLoadObject = (geometryId: string): void => {
    if (geometryId === undefined) {
      throw new Error(
        'removeGeometryLoadObject: geometryId must not be undefined'
      );
    }

    const cachedGeometry = this._geometryCache.get(geometryId);

    if (!cachedGeometry) {
      throw new Error(
        'removeGeometryLoadObject: geometryId was not present in geometryCache'
      );
    }

    this.decrementGeometryCacheSize(cachedGeometry.sizeInBytes);

    const eventDetails = {
      geometry: cachedGeometry,
      geometryId,
    };

    triggerEvent(
      eventTarget,
      Events.GEOMETRY_CACHE_GEOMETRY_REMOVED,
      eventDetails
    );
    this._decacheGeometry(geometryId);
  };

  /**
   * Deletes the geometryId from the geometry cache
   *
   * @param geometryId - geometryId
   */
  private _decacheGeometry = (geometryId: string) => {
    const cachedGeometry = this._geometryCache.get(geometryId);

    if (!cachedGeometry) {
      return;
    }

    const { geometryLoadObject } = cachedGeometry;

    // Cancel any in-progress loading
    if (geometryLoadObject.cancelFn) {
      geometryLoadObject.cancelFn();
    }

    if (geometryLoadObject.decache) {
      geometryLoadObject.decache();
    }

    this._geometryCache.delete(geometryId);
  };

  /**
   * Increases the geometry cache size with the provided increment
   *
   * @param increment - bytes length
   */
  public incrementGeometryCacheSize = (increment: number) => {
    this._geometryCacheSize += increment;
  };

  /**
   * Decreases the geometry cache size with the provided decrement
   *
   * @param decrement - bytes length
   */
  public decrementGeometryCacheSize = (decrement: number) => {
    this._geometryCacheSize -= decrement;
  };

  /**
   * Find the image that has the referenced ImageId
   */
  public getImageByReferencedImageId = (
    referencedImageId: string
  ): IImage | undefined => {
    const cachedImage = Array.from(this._imageCache.values()).find(
      (cachedImage) =>
        cachedImage.image?.referencedImageId === referencedImageId
    );
    return cachedImage?.image;
  };

  /**
   * Returns the image associated with the imageId
   *
   * @param imageId - image ID
   * @param minQuality - the minimum image quality to fetch
   * @returns Image
   */
  public getImage = (
    imageId: string,
    minQuality = ImageQualityStatus.FAR_REPLICATE
  ): IImage | undefined => {
    if (imageId === undefined) {
      throw new Error('getImage: imageId must not be undefined');
    }

    const cachedImage = this._imageCache.get(imageId);

    if (!cachedImage) {
      return;
    }
    // Bump time stamp for cached volume (not used for anything for now)
    cachedImage.timeStamp = Date.now();

    if (cachedImage.image?.imageQualityStatus < minQuality) {
      return;
    }

    return cachedImage.image;
  };

  /**
   * Sets a partial image qualty to use, allowing another load to occur.
   * If the partialImage is not defined, will use any current image defined.
   * This will ONLY replace the current image if the quality is at least as
   * good.
   * This will not cancel any in flight requests, but will remove any partial
   * loaded requests.
   *
   * @param imageId - image ID
   * @param partialImage - partial image to use
   */
  public setPartialImage(imageId: string, partialImage?: IImage) {
    const cachedImage = this._imageCache.get(imageId);
    if (!cachedImage) {
      if (partialImage) {
        this._imageCache.set(imageId, {
          image: partialImage,
          imageId,
          loaded: false,
          timeStamp: Date.now(),
          sizeInBytes: 0,
        });
      }
      return;
    }
    if (cachedImage.loaded) {
      cachedImage.loaded = false;
      cachedImage.imageLoadObject = null;
      this.incrementImageCacheSize(-cachedImage.sizeInBytes);
      cachedImage.sizeInBytes = 0;
      cachedImage.image = partialImage || cachedImage.image;
    } else {
      cachedImage.image = partialImage || cachedImage.image;
    }
  }

  /** Gets the current image quality for the given image id */
  public getImageQuality(imageId: string) {
    const image = this._imageCache.get(imageId)?.image;
    return image
      ? image.imageQualityStatus || ImageQualityStatus.FULL_RESOLUTION
      : undefined;
  }

  /**
   * Returns the volume associated with the volumeId
   *
   * @param volumeId - Volume ID
   * @param allowPartialMatch - If true, the volumeId can be a partial match
   * @returns Volume
   */
  public getVolume = (
    volumeId: string,
    allowPartialMatch = false
  ): IImageVolume | undefined => {
    if (volumeId === undefined) {
      throw new Error('getVolume: volumeId must not be undefined');
    }

    const cachedVolume = this._volumeCache.get(volumeId);

    if (!cachedVolume) {
      return allowPartialMatch
        ? [...this._volumeCache.values()].find((cv) =>
            cv.volumeId.includes(volumeId)
          )?.volume
        : undefined;
    }

    cachedVolume.timeStamp = Date.now();

    return cachedVolume.volume;
  };

  /**
   * Retrieves an array of image volumes from the cache.
   * @returns An array of image volumes.
   */
  public getVolumes = (): IImageVolume[] => {
    const cachedVolumes = Array.from(this._volumeCache.values());

    return cachedVolumes.map((cachedVolume) => cachedVolume.volume);
  };

  /**
   * Filters the cached volumes by the specified reference volume ID.
   * @param volumeId - The ID of the reference volume.
   * @returns An array of image volumes that have the specified reference volume ID.
   */
  public filterVolumesByReferenceId = (volumeId: string): IImageVolume[] => {
    const cachedVolumes = this.getVolumes();

    return cachedVolumes.filter((volume) => {
      return volume.referencedVolumeId === volumeId;
    });
  };

  /**
   * Removes the image loader associated with a given Id from the cache
   *
   * It increases the cache size after removing the image.
   *
   * fires Events.IMAGE_CACHE_IMAGE_REMOVED
   *
   * @param imageId - Image ID
   */
  public removeImageLoadObject = (
    imageId: string,
    { force = false }: { force?: boolean } = {}
  ): void => {
    if (imageId === undefined) {
      throw new Error('removeImageLoadObject: imageId must not be undefined');
    }

    const cachedImage = this._imageCache.get(imageId);

    if (!cachedImage) {
      throw new Error(
        'removeImageLoadObject: imageId was not present in imageCache'
      );
    }

    this._decacheImage(imageId, force);

    this.incrementImageCacheSize(-cachedImage.sizeInBytes);

    const eventDetails = {
      image: cachedImage,
      imageId,
    };

    triggerEvent(eventTarget, Events.IMAGE_CACHE_IMAGE_REMOVED, eventDetails);
  };

  /**
   * Removes the volume loader associated with a given Id from the cache
   *
   * It increases the cache size after removing the image.
   *
   * fires Events.VOLUME_CACHE_VOLUME_REMOVED
   *
   * @param imageId - ImageId
   */
  public removeVolumeLoadObject = (volumeId: string): void => {
    if (volumeId === undefined) {
      throw new Error('removeVolumeLoadObject: volumeId must not be undefined');
    }

    const cachedVolume = this._volumeCache.get(volumeId);

    if (!cachedVolume) {
      throw new Error(
        'removeVolumeLoadObject: volumeId was not present in volumeCache'
      );
    }

    const eventDetails = {
      volume: cachedVolume,
      volumeId,
    };

    triggerEvent(eventTarget, Events.VOLUME_CACHE_VOLUME_REMOVED, eventDetails);
    this._decacheVolume(volumeId);
  };

  /**
   * Increases the image cache size with the provided increment
   *
   * @param increment - bytes length
   */
  public incrementImageCacheSize = (increment: number) => {
    this._imageCacheSize += increment;
  };

  /**
   * Decreases the image cache size with the provided decrement
   *
   * @param decrement - bytes length
   */
  public decrementImageCacheSize = (decrement: number) => {
    this._imageCacheSize -= decrement;
  };

  public getGeometryLoadObject = (
    geometryId: string
  ): IGeometryLoadObject | undefined => {
    if (geometryId === undefined) {
      throw new Error(
        'getGeometryLoadObject: geometryId must not be undefined'
      );
    }

    const cachedGeometry = this._geometryCache.get(geometryId);

    if (!cachedGeometry) {
      return;
    }

    cachedGeometry.timeStamp = Date.now();

    return cachedGeometry.geometryLoadObject;
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
export { Cache, cache }; // for documentation
