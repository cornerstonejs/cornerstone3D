export interface ImageLoadObject {
  promise: any // Promise<Image>
  cancel?: () => void
  decache?: () => void
}

export interface VolumeLoadObject {
  promise: any // Promise<Volume>
  cancel?: () => void
  decache?: () => void
}
