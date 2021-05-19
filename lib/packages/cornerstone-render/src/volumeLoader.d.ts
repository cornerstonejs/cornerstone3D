import * as Types from './types';
interface VolumeLoaderOptions {
    imageIds: Array<string>;
}
/**
 * Loads a volume given a volumeId and optional priority and returns a promise which will resolve to
 * the loaded image object or fail if an error occurred.  The loaded image is not stored in the cache.
 *
 * @param {String} volumeId A Cornerstone Image Object's volumeId
 * @param {Object} [options] Options to be passed to the Volume Loader
 *
 * @returns {Types.VolumeLoadObject} An Object which can be used to act after an image is loaded or loading fails
 * @category VolumeLoader
 */
export declare function loadVolume(volumeId: string, options?: VolumeLoaderOptions): Promise<Types.IImageVolume>;
/**
 * Loads an image given an volumeId and optional priority and returns a promise which will resolve to
 * the loaded image object or fail if an error occurred. The image is stored in the cache.
 *
 * @param {String} volumeId A Cornerstone Image Object's volumeId
 * @param {Object} [options] Options to be passed to the Volume Loader
 *
 * @returns {Types.VolumeLoadObject} Volume Loader Object
 * @category VolumeLoader
 */
export declare function createAndCacheVolume(volumeId: string, options: VolumeLoaderOptions): Promise<Record<string, any>>;
/**
 * Registers an volumeLoader plugin with cornerstone for the specified scheme
 *
 * @param {String} scheme The scheme to use for this volume loader (e.g. 'dicomweb', 'wadouri', 'http')
 * @param {Function} volumeLoader A Cornerstone Volume Loader function
 * @returns {void}
 * @category VolumeLoader
 */
export declare function registerVolumeLoader(scheme: string, volumeLoader: Types.VolumeLoaderFn): void;
/**
 * Registers a new unknownVolumeLoader and returns the previous one
 *
 * @param {Function} volumeLoader A Cornerstone Volume Loader
 *
 * @returns {Function|Undefined} The previous Unknown Volume Loader
 * @category VolumeLoader
 */
export declare function registerUnknownVolumeLoader(volumeLoader: Types.VolumeLoaderFn): Types.VolumeLoaderFn | undefined;
export {};
