import { ImageActor } from './IActor';

/**
 * Stack input callback type, used to perform operations on the image data
 * after it has been loaded.
 */
type StackInputCallback = (params: {
  /** vtk image actor */
  imageActor: ImageActor;
  /** unique image Id in the cache */
  imageId: string;
}) => unknown;

/**
 * StackInput that can be used to add an image actor  to a viewport. It includes
 * mandatory `imageId` but other options such as `visibility` and `callback`
 * can also be provided
 */
interface IStackInput {
  /** imageId of the image in the cache */
  imageId: string;
  // actorUID of the imageActor being added
  actorUID?: string;
  /** Visibility of the image actor - by default it is true */
  visibility?: boolean;
  /** Callback to be called when the image is added to the viewport */
  callback?: StackInputCallback;
}

export type { IStackInput, StackInputCallback };
