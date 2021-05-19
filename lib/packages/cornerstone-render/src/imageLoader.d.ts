import { IImage, ImageLoaderFn } from './types';
export interface ImageLoaderOptions {
    priority: number;
    requestType: string;
    additionalDetails?: Record<string, unknown>;
}
/**
 * Loads an image given an imageId and optional priority and returns a promise
 * which will resolve to the loaded image object or fail if an error occurred.
 * The loaded image is not stored in the cache.
 *
 *
 * @param {String} imageId A Cornerstone Image Object's imageId
 * @param {Object} [options] Options to be passed to the Image Loader
 *
 * @returns {ImageLoadObject} An Object which can be used to act after an image is loaded or loading fails
 * @category ImageLoader
 */
export declare function loadImage(imageId: string, options?: ImageLoaderOptions): Promise<IImage>;
/**
 * Loads an image given an imageId and optional priority and returns a promise
 * which will resolve to the loaded image object or fail if an error occurred.
 * The image is stored in the cache.
 *
 * @param {String} imageId A Cornerstone Image Object's imageId
 * @param {Object} [options] Options to be passed to the Image Loader
 *
 * @returns {ImageLoadObject} Image Loader Object
 * @category ImageLoader
 */
export declare function loadAndCacheImage(imageId: string, options?: ImageLoaderOptions): Promise<IImage>;
/**
 * Load and cache a list of imageIds
 *
 * @param {Array} imageIds list of imageIds
 * @param {ImageLoaderOptions} options options for loader
 * @category ImageLoader
 *
 */
export declare function loadAndCacheImages(imageIds: Array<string>, options?: ImageLoaderOptions): Promise<IImage>[];
/**
 * Removes the imageId from the request pool manager
 *
 * @param {String} imageId
 *
 * @returns {void}
 * @category ImageLoader
 */
export declare function cancelLoadImage(imageId: string): void;
/**
 * Removes the imageIds from the request pool manager
 *
 * @param {Array} Array of imageIds
 *
 * @returns {void}
 * @category ImageLoader
 */
export declare function cancelLoadImages(imageIds: Array<string>): void;
/**
 * Removes all the requests
 *
 * @param {Array} Array of imageIds
 *
 * @returns {void}
 * @category ImageLoader
 */
export declare function cancelLoadAll(): void;
/**
 * Registers an imageLoader plugin with cornerstone for the specified scheme
 *
 * @param {String} scheme The scheme to use for this image loader (e.g. 'dicomweb', 'wadouri', 'http')
 * @param {Function} imageLoader A Cornerstone Image Loader function
 * @returns {void}
 * @category ImageLoader
 */
export declare function registerImageLoader(scheme: string, imageLoader: ImageLoaderFn): void;
/**
 * Registers a new unknownImageLoader and returns the previous one
 *
 * @param {Function} imageLoader A Cornerstone Image Loader
 *
 * @returns {Function|Undefined} The previous Unknown Image Loader
 * @category ImageLoader
 */
export declare function registerUnknownImageLoader(imageLoader: ImageLoaderFn): ImageLoaderFn;
/**
 * Removes all registered and unknown image loaders
 *
 * @returns {void}
 * @category ImageLoader
 */
export declare function unregisterAllImageLoaders(): void;
