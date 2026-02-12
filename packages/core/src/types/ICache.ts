import type { IImageLoadObject, IVolumeLoadObject } from './ILoadObject';
import type IImage from './IImage';

/**
 * Compression provider interface for pluggable cache compression
 *
 * Implementations can provide custom compression strategies (e.g., WebP, JPEG,
 * PNG, or specialized medical image compression formats like JPEG-LS).
 *
 * @example
 * ```typescript
 * const webpProvider: CompressionProvider = {
 *   compress: async (image) => {
 *     // Convert image to WebP blob
 *     return blob;
 *   },
 *   decompress: async (blob, imageId) => {
 *     // Convert blob back to IImage
 *     return image;
 *   }
 * };
 * cache.setCompressionProvider(webpProvider);
 * ```
 */
interface CompressionProvider {
  /**
   * Compress a Cornerstone image to a blob
   * @param image - The image to compress
   * @returns Promise resolving to compressed blob
   */
  compress: (image: IImage) => Promise<Blob>;

  /**
   * Decompress a blob back to a Cornerstone image
   * @param blob - The compressed blob
   * @param imageId - The image identifier
   * @returns Promise resolving to decompressed image
   */
  decompress: (blob: Blob, imageId: string) => Promise<IImage>;
}

interface ICache {
  /** Set the maximum cache size  */
  setMaxCacheSize: (maxCacheSize: number) => void;
  /** Get the maximum cache size  */
  getMaxCacheSize: () => number;
  /** Get the current cache size  */
  getCacheSize: () => number;
  /** Stores the imageLoad Object inside the cache */
  putImageLoadObject: (
    imageId: string,
    imageLoadObject: IImageLoadObject,
    updateCache?: boolean
  ) => Promise<void>;
  /** Retrieves the imageLoad Object from the cache */
  getImageLoadObject: (imageId: string) => IImageLoadObject | void;
  /** Stores the volumeLoad Object inside the cache */
  putVolumeLoadObject: (
    volumeId: string,
    volumeLoadObject: IVolumeLoadObject
  ) => Promise<void>;
  /** Retrieves the volumeLoad Object from the cache */
  getVolumeLoadObject: (volumeId: string) => IVolumeLoadObject | void;
  /** Purge cache both image and volume */
  purgeCache: () => void;
  /** Set a compression provider for the cache */
  setCompressionProvider: (provider: CompressionProvider | null) => void;
  /** Get the current compression provider */
  getCompressionProvider: () => CompressionProvider | null;
}

export type { ICache as default, CompressionProvider };
