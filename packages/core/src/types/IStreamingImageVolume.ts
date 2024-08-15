import type { ImageVolume } from './../cache/classes/ImageVolume';

/**
 * Cornerstone StreamingImageVolume which extends ImageVolume
 */
export default interface IStreamingImageVolume extends ImageVolume {
  /** method to load all the loading requests */
  clearLoadCallbacks(): void;
  /** method to decache the volume from cache */
  decache(completelyRemove: boolean): void;
}
