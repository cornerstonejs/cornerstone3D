import { ImageActor } from './IActor';

/**
 * Volume input callback type, used to perform operations on the volume data
 * after it has been loaded.
 */
type StackInputCallback = (params: {
  /** vtk volume actor */
  imageActor: ImageActor;
  /** unique volume Id in the cache */
  imageId: string;
}) => unknown;

/**
 * VolumeInput that can be used to add a volume to a viewport. It includes
 * mandatory `volumeId` but other options such as `visibility`, `blendMode`,
 * `slabThickness` and `callback` can also be provided
 */
interface IStackInput {
  /** imageId of the image in the cache */
  imageId: string;
  // actorUID for segmentations
  actorUID?: string;
  /** Visibility of the image actor - by default it is true */
  visibility?: boolean;
  /** Callback to be called when the volume is added to the viewport */
  callback?: StackInputCallback;
}

export type { IStackInput, StackInputCallback };
