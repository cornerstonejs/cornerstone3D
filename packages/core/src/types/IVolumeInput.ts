import type { VolumeActor } from './IActor';
import type BlendModes from '../enums/BlendModes';

/**
 * Volume input callback type, used to perform operations on the volume data
 * after it has been loaded.
 */
type VolumeInputCallback = (params: {
  /** vtk volume actor */
  volumeActor: VolumeActor;
  /** unique volume Id in the cache */
  volumeId: string;
}) => unknown;

/**
 * VolumeInput that can be used to add a volume to a viewport. It includes
 * mandatory `volumeId` but other options such as `visibility`, `blendMode`,
 * `slabThickness` and `callback` can also be provided
 */
type IVolumeInput = {
  /** Volume ID of the volume in the cache */
  volumeId: string;
  // actorUID for segmentations, since two segmentations with the same volumeId
  // can have different representations
  actorUID?: string;
  /** Visibility of the volume - by default it is true */
  visibility?: boolean;
  /** Callback to be called when the volume is added to the viewport */
  callback?: VolumeInputCallback;
  /** Blend mode of the volume - by default it is `additive` */
  blendMode?: BlendModes;
  /** Slab thickness of the volume - by default it is 0.05*/
  slabThickness?: number;
  /** other metadata that is needed for the volume */
  [key: string]: unknown;
};

export type { IVolumeInput, VolumeInputCallback };
