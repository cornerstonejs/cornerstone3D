import { IImageLoadObject, IVolumeLoadObject } from './ILoadObject';

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
  ) => Promise<any>;
  /** Retrieves the imageLoad Object from the cache */
  getImageLoadObject: (imageId: string) => IImageLoadObject | void;
  /** Stores the volumeLoad Object inside the cache */
  putVolumeLoadObject: (
    volumeId: string,
    volumeLoadObject: IVolumeLoadObject
  ) => Promise<any>;
  /** Retrieves the volumeLoad Object from the cache */
  getVolumeLoadObject: (volumeId: string) => IVolumeLoadObject | void;
  /** Purge cache both image and volume */
  purgeCache: () => void;
}

export default ICache;
