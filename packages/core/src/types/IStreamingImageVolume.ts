import type IImageVolume from './IImageVolume';

/**
 * Cornerstone StreamingImageVolume which extends ImageVolume
 */
export default interface IStreamingImageVolume extends IImageVolume {
  /** method to load all the loading requests */
  clearLoadCallbacks(): void;
  /** method to decache the volume from cache */
  decache(completelyRemove?: boolean): void;
}
