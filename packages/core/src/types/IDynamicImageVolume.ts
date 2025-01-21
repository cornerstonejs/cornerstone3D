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
   * @deprecated Use dimensionGroupNumber instead. timePointIndex is zero-based while dimensionGroupNumber starts at 1.
   */
  get timePointIndex(): number;

  /**
   * @deprecated Use dimensionGroupNumber instead. timePointIndex is zero-based while dimensionGroupNumber starts at 1.
   */
  set timePointIndex(timePointIndex: number);

  /**
   * @deprecated Use numDimensionGroups instead
   */
  get numTimePoints(): number;

  /**
   * Scroll through dimension groups, handling wrapping at start/end
   * @param delta - The number of dimension groups to scroll by (positive or negative)
   */
  scroll(delta: number): void;
}

export type { IDynamicImageVolume as default };
