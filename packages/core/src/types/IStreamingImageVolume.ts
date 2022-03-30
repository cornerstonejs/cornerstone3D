import { ImageVolume } from './../cache/classes/ImageVolume';

/**
 * Cornerstone StreamingImageVolume which extends ImageVolume
 */
export default interface IStreamingImageVolume extends ImageVolume {
  /** method to load all the loading requests */
  clearLoadCallbacks(): void;
  /** method to convert the volume data in the volume cache, to separate images in the image cache */
  convertToCornerstoneImage(imageId: string, imageIdIndex: number): any;
  /** method to decache the volume from cache */
  decache(completelyRemove: boolean): void;
}
