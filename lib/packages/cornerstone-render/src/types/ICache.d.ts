import { ImageLoadObject, VolumeLoadObject } from './ILoadObject';
interface ICache {
    setMaxCacheSize: (maxCacheSize: number) => void;
    getMaxCacheSize: () => number;
    getCacheSize: () => number;
    putImageLoadObject: (imageId: string, imageLoadObject: ImageLoadObject) => Promise<any>;
    getImageLoadObject: (imageId: string) => ImageLoadObject | void;
    putVolumeLoadObject: (volumeId: string, volumeLoadObject: VolumeLoadObject) => Promise<any>;
    getVolumeLoadObject: (volumeId: string) => VolumeLoadObject | void;
    purgeCache: () => void;
}
export default ICache;
