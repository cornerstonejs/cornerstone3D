import type { vtkImageData } from '@kitware/vtk.js/Common/DataModel/ImageData';
import { Metadata, Point3, IImageLoadObject, Mat3 } from '../types';

/**
 * Cornerstone ImageVolume interface. Todo: we should define new IVolume class
 * with appropriate typings for the other types of volume that don't have images (nrrd, nifti)
 */
interface IImageVolume {
  /** unique identifier of the volume in the cache */
  readonly volumeId: string;
  /** volume dimensions */
  dimensions: Point3;
  /** volume direction */
  direction: Mat3;
  /** volume metadata */
  metadata: Metadata;
  /** volume origin - set to the imagePositionPatient of the last image in the volume */
  origin: Point3;
  /** volume scalar data */
  scalarData: any;
  /** Whether preScaling has been performed on the volume */
  isPrescaled: boolean;
  /** volume scaling metadata */
  scaling?: {
    PET?: {
      SUVlbmFactor?: number;
      SUVbsaFactor?: number;
      suvbwToSuvlbm?: number;
      suvbwToSuvbsa?: number;
    };
  };
  /** volume size in bytes */
  sizeInBytes?: number;
  /** volume spacing */
  spacing: Point3;
  /** number of voxels in the volume */
  numVoxels: number;
  /** volume image data as vtkImageData */
  imageData?: vtkImageData;
  /** openGL texture for the volume */
  vtkOpenGLTexture: any;
  /** loading status object for the volume containing loaded/loading statuses */
  loadStatus?: Record<string, any>;
  /** imageIds of the volume (if it is built of separate imageIds) */
  imageIds?: Array<string>;
  /** volume referencedVolumeId (if it is derived from another volume) */
  referencedVolumeId?: string; // if volume is derived from another volume
  /** whether the metadata for the pixel spacing is not undefined  */
  hasPixelSpacing: boolean;
  /** method to convert the volume data in the volume cache, to separate images in the image cache */
  convertToCornerstoneImage?: (
    imageId: string,
    imageIdIndex: number
  ) => IImageLoadObject;

  //cancel load
  cancelLoading?: () => void;
}

export default IImageVolume;
