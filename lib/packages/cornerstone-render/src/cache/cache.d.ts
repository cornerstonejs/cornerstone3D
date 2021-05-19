import { ICache, IImageVolume, ImageLoadObject, VolumeLoadObject } from '../types';
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
declare class Cache implements ICache {
    private readonly _imageCache;
    private readonly _volumeCache;
    private _imageCacheSize;
    private _volumeCacheSize;
    private _maxCacheSize;
    constructor();
    /**
     * Set the maximum cache Size
     *
     * Maximum cache size should be set before adding the data; otherwise, it
     * will throw an error.
     *
     * @param {number} newMaxCacheSize new maximum cache size
     *
     * @returns {void}
     */
    setMaxCacheSize: (newMaxCacheSize: number) => void;
    /**
     * Checks if there is enough space in the cache for requested byte size
     *
     * It throws error, if the sum of volatile (image) cache and unallocated cache
     * is less than the requested byteLength
     *
     * @param {number} byteLength byte length of requested byte size
     *
     * @returns {boolean}
     */
    isCacheable: (byteLength: number) => void;
    /**
     * Returns maximum CacheSize allowed
     *
     * @returns {number} maximum allowed cache size
     */
    getMaxCacheSize: () => number;
    /**
     * Returns current size of the cache
     *
     * @returns {number} current size of the cache
     */
    getCacheSize: () => number;
    /**
     * Returns the unallocated size of the cache
     *
     */
    getBytesAvailable(): number;
    /**
     * Deletes the imageId from the image cache
     *
     * @param {string} imageId imageId
     *
     * @returns {void}
     */
    private _decacheImage;
    /**
     * Deletes the volumeId from the volume cache
     *
     * @param {string} volumeId volumeId
     *
     * @returns {void}
     */
    private _decacheVolume;
    /**
     * Deletes all the images and volumes in the cache
     *
     * Relevant events are fired for each decached image (IMAGE_CACHE_IMAGE_REMOVED) and
     * the decached volume (IMAGE_CACHE_VOLUME_REMOVED).
     *
     *
     * @param {number} numBytes number of bytes
     *
     * @returns {number} available number of bytes
     */
    purgeCache: () => void;
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
     * @params {number} numBytes - Number of bytes for the image/volume that is
     * going to be stored inside the cache
     * @params {Array} [volumeImageIds] list of imageIds that correspond to the
     * volume whose numberOfBytes we want to store in the cache.
     * @returns {number | undefined} bytesAvailable or undefined in purging cache
     * does not successfully make enough space for the requested number of bytes
     */
    decacheIfNecessaryUntilBytesAvailable(numBytes: number, volumeImageIds?: Array<string>): number | undefined;
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
     * @param {string} imageId ImageId for the image
     * @param {Object} imageLoadObject The object that is loading or loaded the image
     * @returns {void}
     */
    putImageLoadObject(imageId: string, imageLoadObject: ImageLoadObject): Promise<any>;
    /**
     * Returns the object that is loading a given imageId
     *
     * @param {string} imageId Image ID
     * @returns {void}
     */
    getImageLoadObject(imageId: string): ImageLoadObject;
    /**
     * Returns the volume that contains the requested imageId. It will check the
     * imageIds inside the volume to find a match.
     *
     * @param {string} imageId Image ID
     * @returns {{ImageVolume, string}|undefined} {volume, imageIdIndex}
     */
    getVolumeContainingImageId(imageId: string): {
        volume: IImageVolume;
        imageIdIndex: number;
    };
    /**
     * Returns the cached image from the imageCache for the requested imageId.
     * It first strips the imageId to remove the data loading scheme.
     *
     * @param {string} imageId Image ID
     * @returns {CachedImage} cached image
     */
    getCachedImageBasedOnImageURI(imageId: string): any;
    /**
     * Puts a new image load object into the cache
     *
     * First, it creates a CachedVolume object and put it inside the volumeCache for
     * the volumeId. After the volumeLoadObject promise resolves to a volume,
     * it: 1) adds the volume into the correct CachedVolume object inside volumeCache
     * 2) increments the cache size, 3) triggers IMAGE_CACHE_VOLUME_ADDED  4) Purge
     * the cache if necessary -- if the cache size is greater than the maximum cache size, it
     * iterates over the imageCache (not volumeCache) and decache them one by one
     * until the cache size becomes less than the maximum allowed cache size
     *
     * @param {string} volumeId volumeId of the volume
     * @param {Object} volumeLoadObject The object that is loading or loaded the volume
     * @returns {void}
     */
    putVolumeLoadObject(volumeId: string, volumeLoadObject: VolumeLoadObject): Promise<any>;
    /**
     * Returns the object that is loading a given volumeId
     *
     * @param {string} volumeId Volume ID
     * @returns {void}
     */
    getVolumeLoadObject: (volumeId: string) => VolumeLoadObject;
    /**
     * Returns the volume associated with the volumeId
     *
     * @param {string} volumeId Volume ID
     * @returns {void}
     */
    getVolume: (volumeId: string) => IImageVolume;
    /**
     * Removes the image loader associated with a given Id from the cache
     *
     * It increases the cache size after removing the image.
     *
     * @param {string} imageId Image ID
     * @returns {void}
     */
    removeImageLoadObject: (imageId: string) => void;
    /**
     * Removes the volume loader associated with a given Id from the cache
     *
     * It increases the cache size after removing the image.
     *
     * @param {string} imageId Image ID
     * @returns {void}
     */
    removeVolumeLoadObject: (volumeId: string) => void;
    /**
     * Increases the image cache size with the provided increment
     *
     * @param {number} increment bytes length
     * @returns {void}
     */
    private _incrementImageCacheSize;
    /**
     * Increases the cache size with the provided increment
     *
     * @param {number} increment bytes length
     * @returns {void}
     */
    private _incrementVolumeCacheSize;
}
declare const cache: Cache;
export default cache;
export { Cache };
