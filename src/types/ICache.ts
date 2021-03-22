import ImageVolume from 'src/cache/classes/ImageVolume'
import StreamingImageVolume from '@cornerstone-streaming-image-volume-loader/StreamingImageVolume'

interface ICache {
  getImageVolume: (uid: string) => ImageVolume | StreamingImageVolume
  setMaxCacheSize: (maxCacheSize: number) => void
  getMaxCacheSize: () => number
  getCacheSize: () => number
  decacheVolume: (uid: string) => void
  putImageLoadObject: (imageId: string, imageLoadObject: ImageLoadObject) => void
  getImageLoadObject: (imageId: string) => ImageLoadObject | void
  decacheImage: (uid: string) => void
  putVolumeLoadObject: (volumeId: string, volumeLoadObject: VolumeLoadObject) => void
  getVolumeLoadObject: (volumeId: string) => VolumeLoadObject | void
  decacheVolume: (uid: string) => void
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
