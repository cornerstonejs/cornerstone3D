import type IImageVolume from './IImageVolume';

/**
 * Cornerstone ImageVolume interface. Todo: we should define new IVolume class
 * with appropriate typings for the other types of volume that don't have images (nrrd, nifti)
 */
interface IDynamicImageVolume extends IImageVolume {
  /**
   * Returns the active time point index
   * The first index starts at 1
   */
  get timePointIndex(): number;
  /**
   * Set the active time point index which also updates the active scalar data
   * The first index starts at 1
   */
  set timePointIndex(newTimePointIndex: number);
  /**
   * Returns the number of time points
   */
  get numTimePoints(): number;

  scroll(delta: number): void;
}

export type { IDynamicImageVolume as default };
