import { ImageVolume } from './../cache/classes/ImageVolume'
import IImage from './IImage'
import IVolume from './IVolume'
export interface ImageLoadObject {
  promise: Promise<IImage>
  cancel?: () => void
  decache?: () => void
}

export interface VolumeLoadObject {
  promise: Promise<ImageVolume>
  cancel?: () => void
  decache?: () => void
}
