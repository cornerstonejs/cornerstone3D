import type IImageVolume from './IImageVolume';

/**
 * Interface for 4D Dynamic Image Volume that supports frame-based operations
 */
interface IDynamicImageVolume extends IImageVolume {
  /**
   * Returns the active frame number (1-based)
   */
  get frameNumber(): number;

  /**
   * Set the active frame number which also updates the active scalar data
   * Frame numbers are 1-based
   */
  set frameNumber(frameNumber: number);

  /**
   * @deprecated Use frameNumber instead. timePointIndex is zero-based while frameNumber starts at 1.
   */
  get timePointIndex(): number;

  /**
   * @deprecated Use frameNumber instead. timePointIndex is zero-based while frameNumber starts at 1.
   */
  set timePointIndex(timePointIndex: number);

  /**
   * @deprecated Use numFrames instead
   */
  get numTimePoints(): number;

  /**
   * Scroll through frames, handling wrapping at start/end
   * @param delta - The number of frames to scroll by (positive or negative)
   */
  scroll(delta: number): void;
}

export type { IDynamicImageVolume as default };
