import type IImageVolume from './IImageVolume';

/**
 * Interface for Dynamic Image Volume that supports dimension group-based operations
 */
interface IDynamicImageVolume extends IImageVolume {
  /**
   * Returns the active dimension group number (1-based)
   */
  get dimensionGroupNumber(): number;

  /**
   * Set the active dimension group number which also updates the active scalar data
   * Dimension group numbers are 1-based
   */
  set dimensionGroupNumber(dimensionGroupNumber: number);

  /**
   * Number of dimension groups in the volume
   */
  get numDimensionGroups(): number;

  /**
   * Returns the imageIds of the active dimension group only. The volume's
   * `imageIds` span every dimension group, so anything resolving an imageId
   * for what is currently on screen needs this subset instead.
   */
  getCurrentDimensionGroupImageIds(): string[];

  /**
   * Scroll through dimension groups, handling wrapping at start/end
   * @param delta - The number of dimension groups to scroll by (positive or negative)
   */
  scroll(delta: number): void;
}

export type { IDynamicImageVolume as default };
