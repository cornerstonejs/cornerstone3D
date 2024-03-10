import { VolumeProps } from '.';

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
}

export { ImageVolumeProps };
