import { IImageCache } from './../types'

import ERROR_CODES from './../enums/errorCodes'

const MAX_CACHE_SIZE_1GB = 1073741824
const REQUEST_TYPE = 'prefetch'

interface ImageLoadObject {
  promise: Promise
  cancel?: Function
  decache?: Function
}

interface VolumeLoadObject {
  promise: Promise
  cancel?: Function
  decache?: Function
}

interface CachedImage {
  imageId: string,
  imageLoadObject: ImageLoadObject,
  loaded: boolean,
  sharedCacheKey?: string,
  timeStamp: number,
  sizeInBytes: number
}

interface CachedVolume {
  volumeId: string,
  volumeLoadObject: VolumeLoadObject,
  loaded: boolean,
  timeStamp: number,
  sizeInBytes: number
}

class Cache implements IImageCache {
  private _imageLoadObjects: Map<string, ImageLoadObject>
  private _volumeLoadObjects: Map<string, VolumeLoadObject>
  private _volatileCache: Map<string, CachedImage>
  private _nonVolatileCache: Map<string, CachedVolume>
  private _cacheSize: number
  private _maxCacheSize: number

  constructor() {
    this._volatileCache = new Map()
    this._nonVolatileCache = new Map()
    this._cacheSize = 0
    this._maxCacheSize = MAX_CACHE_SIZE_1GB // Default 1GB
  }

  public setMaxCacheSize = (newMaxCacheSize: number) => {
    this._maxCacheSize = newMaxCacheSize

    if (this._maxCacheSize > this._cacheSize) {
      const errorMessage = `New max cacheSize ${this._maxCacheSize} larger than current cachesize ${this._cacheSize}. You should set the maxCacheSize before adding data to the cache.`
      throw new Error(errorMessage)
    }
  }

  // todo need another name for this function
  public checkCacheSizeCanSupportVolume = (byteLength: number) => {
    if (currentCacheSize + byteLength > this.getMaxCacheSize()) {
     throw new Error(ERROR_CODES.CACHE_SIZE_EXCEEDED)
    }
  }

  public getMaxCacheSize = (): number => this._maxCacheSize
  public getCacheSize = (): number => this._cacheSize

  public decacheImage = (imageId: string) => {
    const imageLoadObject = this._imageLoadObjects.get(volumeId)

    // Cancel any in-progress loading
    if (imageLoadObject.cancel) {
      imageLoadObject.cancel()
    }

    if (imageLoadObject.decache) {
      imageLoadObject.decache();
    }

    this.volatileCache._delete(imageId)
  }

  public decacheVolume = (volumeId: string) => {
    const volumeLoadObject = this._volumeLoadObjects.get(volumeId)

    // Cancel any in-progress loading
    if (volumeLoadObject.cancel) {
      volumeLoadObject.cancel()
    }

    if (volumeLoadObject.decache) {
      volumeLoadObject.decache();
    }

    const volume = this.nonVolatileCache.get(volumeId)

    // Clear texture memory (it will probably only be released at garbage collection of the dom element, but might as well try)
    // TODO We need to actually check if this particular scalar is used.
    // TODO: Put this in the volume loader's decache function?
    if (volume && volume.vtkOpenGLTexture) {
      volume.vtkOpenGLTexture.releaseGraphicsResources()
    }

    this.nonVolatileCache._delete(volumeId)
  }

  public purgeCache = () => {
    const imageIterator = this._volatileCache.keys()

    /* eslint-disable no-constant-condition */
    while (true) {
      const { value: imageId, done } = imageIterator.next()

      if (done) {
        break
      }

      this.decacheImage(imageId)
    }

    const volumeIterator = this._nonVolatileCache.keys()

    /* eslint-disable no-constant-condition */
    while (true) {
      const { value: volumeId, done } = volumeIterator.next()

      if (done) {
        break
      }

      this.decacheVolume(volumeId)
    }
  }

  /**
   * Puts a new image load object into the cache
   *
   * @param {string} imageId ImageId of the image loader
   * @param {Object} imageLoadObject The object that is loading or loaded the image
   * @returns {void}
   */
  public putImageLoadObject(imageId: string, imageLoadObject: ImageLoadObject) {
    if (imageId === undefined) {
      throw new Error('putImageLoadObject: imageId must not be undefined');
    }
    if (imageLoadObject.promise === undefined) {
      throw new Error('putImageLoadObject: imageLoadObject.promise must not be undefined');
    }
    if (imageCacheDict.hasOwnProperty(imageId) === true) {
      throw new Error('putImageLoadObject: imageId already in cache');
    }
    if (imageLoadObject.cancelFn && typeof imageLoadObject.cancelFn !== 'function') {
      throw new Error('putImageLoadObject: imageLoadObject.cancelFn must be a function');
    }

    const cachedImage : CachedImage = {
      loaded: false,
      imageId,
      sharedCacheKey: undefined, // The sharedCacheKey for this imageId.  undefined by default
      imageLoadObject,
      timeStamp: Date.now(),
      sizeInBytes: 0
    };

    this._volatileCache.add([imageId], cachedImage);
    cachedImages.push(cachedImage);

    imageLoadObject.promise.then(function (image: Image) {
      if (!this._volatileCache.get(imageId)) {
        // If the image has been purged before being loaded, we stop here.
        console.warn('The image was purged from the cache before it completed loading.')
        return;
      }

      cachedImage.loaded = true;
      cachedImage.image = image;

      if (image.sizeInBytes === undefined) {
        throw new Error('putImageLoadObject: image.sizeInBytes must not be undefined');
      }
      if (image.sizeInBytes.toFixed === undefined) {
        throw new Error('putImageLoadObject: image.sizeInBytes is not a number');
      }

      cachedImage.sizeInBytes = image.sizeInBytes;
      this._incrementCacheSize(cachedImage.sizeInBytes);

      /*const eventDetails = {
        action: 'addImage',
        image: cachedImage
      };

      triggerEvent(events, EVENTS.IMAGE_CACHE_CHANGED, eventDetails);*/

      cachedImage.sharedCacheKey = image.sharedCacheKey;

      purgeCacheIfNecessary();
    }, (error) => {
      console.warn(error);
      this._imageLoadObjects.delete(imageId);
      this._volatileCache.delete(imageId);
    });
  }

  /**
   * Retuns the object that is loading a given imageId
   *
   * @param {string} imageId Image ID
   * @returns {void}
   */
  public getImageLoadObject(imageId: string) {
    if (imageId === undefined) {
      throw new Error('getImageLoadObject: imageId must not be undefined');
    }
    const cachedImage = this._volatileCache.get[imageId];

    if (cachedImage === undefined) {
      return;
    }

    // Bump time stamp for cached image
    cachedImage.timeStamp = Date.now();

    return this._imageLoadObjects.get(imageId);
  }

  /**
   * Puts a new volume load object into the cache
   *
   * @param {string} volumeId Id of the Volume
   * @param {Object} volumeLoadObject
   * @returns {void}
   */
  public putVolumeLoadObject(volumeId: string, volumeLoadObject: VolumeLoadObject) {
    if (volumeId === undefined) {
      throw new Error('putVolumeLoadObject: volumeId must not be undefined');
    }
    if (volumeLoadObject.promise === undefined) {
      throw new Error('putVolumeLoadObject: volumeLoadObject.promise must not be undefined');
    }
    if (this._nonVolatileCache.hasOwnProperty(volumeId) === true) {
      throw new Error('putVolumeLoadObject: volumeId already in cache');
    }
    if (volumeLoadObject.cancelFn && typeof volumeLoadObject.cancelFn !== 'function') {
      throw new Error('putVolumeLoadObject: volumeLoadObject.cancelFn must be a function');
    }

    const cachedVolume : CachedVolume = {
      loaded: false,
      volumeId,
      volumeLoadObject,
      timeStamp: Date.now(),
      sizeInBytes: 0
    };

    this._nonVolatileCache.add([volumeId], cachedVolume);
    cachedImages.push(cachedImage);

    volumeLoadObject.promise.then(function (volume: Volume) {
      if (!this._nonVolatileCache.get(volumeId)) {
        // If the image has been purged before being loaded, we stop here.
        console.warn('The image was purged from the cache before it completed loading.')
        return;
      }

      cachedVolume.loaded = true;
      cachedVolume.volume = volume;

      if (volume.sizeInBytes === undefined) {
        throw new Error('putVolumeLoadObject: volume.sizeInBytes must not be undefined');
      }
      if (volume.sizeInBytes.toFixed === undefined) {
        throw new Error('putVolumeLoadObject: volume.sizeInBytes is not a number');
      }

      cachedVolume.sizeInBytes = image.sizeInBytes;
      this._incrementCacheSize(cachedVolume.sizeInBytes);

      /*const eventDetails = {
        action: 'addImage',
        image: cachedImage
      };

      triggerEvent(events, EVENTS.IMAGE_CACHE_CHANGED, eventDetails);*/

      purgeCacheIfNecessary();
    }, (error) => {
      console.warn(error);
      this._volumeLoadObjects.delete(volumeId);
      this._nonVolatileCache.delete(volumeId);
    });
  }

  /**
   * Retuns the object that is loading a given imageId
   *
   * @param {string} imageId Image ID
   * @returns {void}
   */
  public getVolumeLoadObject(volumeId: string) {
    if (volumeId === undefined) {
      throw new Error('getVolumeLoadObject: volumeId must not be undefined');
    }
    const cachedVolume = this._nonVolatileCache.get(volumeId);

    if (cachedVolume === undefined) {
      return;
    }

    // Bump time stamp for cached volume (not used for anything for now)
    cachedVolume.timeStamp = Date.now();

    return this._volumeLoadObjects.get(imageId);
  }

  /**
   * Removes the image loader associated with a given Id from the cache
   *
   * @param {string} imageId Image ID
   * @returns {void}
   */
  public removeImageLoadObject = (imageId: string) => {
    if (imageId === undefined) {
      throw new Error('removeImageLoadObject: imageId must not be undefined');
    }
    const cachedImage = this._volatileCache.get(imageId);

    if (cachedImage === undefined) {
      throw new Error('removeImageLoadObject: imageId was not present in imageCache');
    }

    cachedImages.splice(cachedImages.indexOf(cachedImage), 1);
    this._incrementCacheSize(-cachedImage.sizeInBytes)

    /*const eventDetails = {
      action: 'deleteImage',
      image: cachedImage
    };

    triggerEvent(events, EVENTS.IMAGE_CACHE_CHANGED, eventDetails);*/
    this.decacheImage(imageId);

    this._imageLoadObjects.delete(imageId)
  }

  private _incrementCacheSize = (increment: number) => {
    this._cacheSize += increment
  }
}

export default new Cache()
