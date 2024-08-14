import type { vtkImageData } from '@kitware/vtk.js/Common/DataModel/ImageData';
import type { VoxelManager } from '../utilities';
import type Metadata from './Metadata';
import type Point3 from './Point3';
import type { IImageLoadObject } from './ILoadObject';
import type Mat3 from './Mat3';
import type { PixelDataTypedArrayString } from './PixelDataTypedArray';
import type RGB from './RGB';

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
  /** Whether preScaling has been performed on the volume */
  isPreScaled: boolean;
  /** volume scaling metadata */
  scaling?: {
    PT?: {
      SUVlbmFactor?: number;
      SUVbsaFactor?: number;
      suvbwToSuvlbm?: number;
      suvbwToSuvbsa?: number;
    };
  };
  /** volume spacing */
  spacing: Point3;
  /** number of voxels in the volume */
  numVoxels: number;
  /** volume image data as vtkImageData */
  imageData?: vtkImageData;
  /** openGL texture for the volume */
  vtkOpenGLTexture: unknown;
  /** loading status object for the volume containing loaded/loading statuses */
  loadStatus?: Record<string, unknown>;
  /** imageIds of the volume (if it is built of separate imageIds) */
  imageIds: string[];
  /** volume referencedVolumeId (if it is derived from another volume) */
  referencedVolumeId?: string; // if volume is derived from another volume
  /** volume referencedImageIds (if it is derived from set of images in the image cache) */
  referencedImageIds?: string[];
  /** whether the metadata for the pixel spacing is not undefined  */
  hasPixelSpacing: boolean;
  /** Property to store additional information */
  additionalDetails?: Record<string, unknown>;
  /** return true if it is a 4D volume or false if it is 3D volume */
  isDynamicVolume(): boolean;

  //cancel load
  cancelLoading?: () => void;

  /**
   * The new volume model which solely relies on the separate image data
   * and do not cache the volume data at all
   */
  voxelManager?: VoxelManager<number> | VoxelManager<RGB>;
  dataType?: PixelDataTypedArrayString;

  /**
   * To be deprecated scalarData and sizeInBytes
   * which is the old model of allocating the volume data
   * and caching it in the volume object
   */
  sizeInBytes?: number;

  /** return the index of a given imageId */
  getImageIdIndex(imageId: string): number;

  /** return the index of a given imageURI */
  getImageURIIndex(imageURI: string): number;

  /** destroy the volume and make it unusable */
  destroy(): void;

  /** decache */
  decache?: (completelyRemove?: boolean) => void;

  /**
   * Mark the volume as having had the pixel data changed externally
   * which in background will re-configure the volume to use the new
   * pixel data.
   *
   */
  modified(): void;
}

export type { IImageVolume as default };
