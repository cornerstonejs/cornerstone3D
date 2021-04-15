import { ImageLoadObject, VolumeLoadObject } from './ILoadObject'

interface ICache {
  setMaxCacheSize: (maxCacheSize: number) => void
  getMaxCacheSize: () => number
  getCacheSize: () => number
  putImageLoadObject: (
    imageId: string,
    imageLoadObject: ImageLoadObject
  ) => void
  getImageLoadObject: (imageId: string) => ImageLoadObject | void
  putVolumeLoadObject: (
    volumeId: string,
    volumeLoadObject: VolumeLoadObject
  ) => void
  getVolumeLoadObject: (volumeId: string) => VolumeLoadObject | void
  purgeCache: () => void
}

/* todo: these will
  loadVolume: (volumeUID: string, callbackFn: Function) => void
  clearLoadCallbacks: (volumeUID: string) => void
  cancelLoadAllVolumes: () => void
  cancelLoadVolume: (volumeUID: string) => void
  makeAndCacheImageVolume: (
    imageIds: Array<string>,
    uid: string
  ) => ImageVolume | StreamingImageVolume
  makeAndCacheDerivedVolume: (
    referencedVolumeUID: string,
    options?: any
  ) => ImageVolume
  makeAndCacheLocalImageVolume: (properties?: any, uid?: string) => ImageVolume

 */

export default ICache
