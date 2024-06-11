import { IImageVolume, PixelDataTypedArray } from '../types';

/**
 * Cornerstone ImageVolume interface. Todo: we should define new IVolume class
 * with appropriate typings for the other types of volume that don't have images (nrrd, nifti)
 */
interface IDynamicImageVolume extends IImageVolume {
  /** Returns the active time point index */
  get timePointIndex(): number;
  /** Set the active time point index which also updates the active scalar data */
  set timePointIndex(newTimePointIndex: number);
  /** Returns the number of time points */
  get numTimePoints(): number;
  /** return scalar data arrays (one per timepoint) */
  getScalarDataArrays(): PixelDataTypedArray[];
}

export default IDynamicImageVolume;
