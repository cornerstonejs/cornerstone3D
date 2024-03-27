import type { VolumeProps } from '.';
import type VoxelManager from '../utilities/VoxelManager';
import type Point3 from './Point3';

/**
 * ImageVolume which is considered a special case of a Volume, which is
 * constructed out of set of images (imageIds). Unlike Volume which can be
 * constructed from any type of volumetric data, such as nifti or nrrd,
 */
interface ImageVolumeProps extends VolumeProps {
  /** imageIds of the volume (if it is built of separate imageIds) */
  imageIds: Array<string>;
  /** if the volume is created from a stack, the imageIds of the stack */
  referencedImageIds?: Array<string>;
  /** A voxel manager for this data */
  voxelManager?: VoxelManager<number> | VoxelManager<Point3>;
}

export { ImageVolumeProps };
