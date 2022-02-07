import { vtkStreamingOpenGLTexture } from '../../RenderingEngine/vtkClasses'
import { IVolume, Metadata, Point3, IImageVolume } from '../../types'

export class ImageVolume implements IImageVolume {
  readonly uid: string
  dimensions: Point3
  direction: Float32Array
  metadata: Metadata
  origin: Point3
  scalarData: Float32Array | Uint8Array
  scaling?: {
    PET?: {
      // @TODO: Do these values exist?
      SUVlbmFactor?: number
      SUVbsaFactor?: number
      // accessed in ProbeTool
      suvbwToSuvlbm?: number
      suvbwToSuvbsa?: number
    }
  }

  sizeInBytes?: number // Seems weird to pass this in? Why not grab it from scalarData.byteLength
  spacing: Point3
  numVoxels: number
  imageData?: any
  vtkOpenGLTexture: any // No good way of referencing vtk classes as they aren't classes.
  loadStatus?: Record<string, any>
  imageIds?: Array<string>
  referenceVolumeUID?: string

  constructor(props: IVolume) {
    this.uid = props.uid
    this.metadata = props.metadata
    this.dimensions = props.dimensions
    this.spacing = props.spacing
    this.origin = props.origin
    this.direction = props.direction
    this.imageData = props.imageData
    this.scalarData = props.scalarData
    this.sizeInBytes = props.sizeInBytes
    this.vtkOpenGLTexture = vtkStreamingOpenGLTexture.newInstance()
    this.numVoxels =
      this.dimensions[0] * this.dimensions[1] * this.dimensions[2]

    if (props.scaling) {
      this.scaling = props.scaling
    }

    if (props.referenceVolumeUID) {
      this.referenceVolumeUID = props.referenceVolumeUID
    }
  }
}

export default ImageVolume
