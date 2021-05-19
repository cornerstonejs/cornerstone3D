import { ImageVolume } from './../cache/classes/ImageVolume';
export default interface IStreamingImageVolume extends ImageVolume {
    clearLoadCallbacks(): void;
    convertToCornerstoneImage(imageId: string, imageIdIndex: number): any;
    decache(completelyRemove: boolean): void;
}
