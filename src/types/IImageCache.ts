import ImageVolume from 'src/imageCache/classes/ImageVolume'
import StreamingImageVolume from 'src/imageCache/classes/StreamingImageVolume'

interface IImageCache {
  getImageVolume: (uid: string) => ImageVolume | StreamingImageVolume
  setMaxCacheSize: (maxCacheSize: number) => void
  getMaxCacheSize: () => number
  getCacheSize: () => number
  decacheVolume: (uid: string) => void
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
  purgeCache: () => void
}

export default IImageCache
