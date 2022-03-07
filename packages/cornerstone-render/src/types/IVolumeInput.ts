import { VolumeActor } from './IActor'

/**
 * Volume input callback type, used to perform operations on the volume data
 * after it has been loaded.
 */
type VolumeInputCallback = (params: {
  /** vtk volume actor */
  volumeActor: VolumeActor
  /** unique volume UID in the cache */
  volumeUID: string
}) => unknown

/**
 * VolumeInput that can be used to add a volume to a viewport. It includes
 * mandatory `volumeUID` but other options such as `visibility`, `blendMode`,
 * `slabThickness` and `callback` can also be provided
 */
interface IVolumeInput {
  /** Volume UID of the volume in the cache */
  volumeUID: string
  // actorUID for segmentations, since two segmentations with the same volumeUID
  // can have different representations
  actorUID?: string
  /** Visibility of the volume - by default it is true */
  visibility?: boolean
  /** Callback to be called when the volume is added to the viewport */
  callback?: VolumeInputCallback
  /** Blend mode of the volume - by default it is `additive` */
  blendMode?: string
  /** Slab thickness of the volume - by default it is calculated by the image size*/
  slabThickness?: number
}

export type { IVolumeInput, VolumeInputCallback }
