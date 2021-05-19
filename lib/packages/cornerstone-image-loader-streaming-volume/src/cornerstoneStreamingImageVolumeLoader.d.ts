import StreamingImageVolume from './StreamingImageVolume';
interface IVolumeLoader {
    promise: Promise<StreamingImageVolume>;
    cancel: () => void;
}
declare function cornerstoneStreamingImageVolumeLoader(volumeId: string, options: {
    imageIds: Array<string>;
}): IVolumeLoader;
export default cornerstoneStreamingImageVolumeLoader;
