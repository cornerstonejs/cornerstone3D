import { vtkStreamingOpenGLTexture } from '../../RenderingEngine/vtkClasses'
import { IVolume, Metadata, Point3 } from '../../types'

export class ImageVolume {
  readonly uid: string
  dimensions: Point3
  direction: Array<number>
  metadata: Metadata
  origin: Array<number>
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
  spacing: Array<number>
  numVoxels: number
  vtkImageData?: any
  vtkOpenGLTexture: any // No good way of referencing vtk classes as they aren't classes.

  constructor(props: IVolume) {
    this.uid = props.uid
    this.metadata = props.metadata
    this.dimensions = props.dimensions
    this.spacing = props.spacing
    this.origin = props.origin
    this.direction = props.direction
    this.vtkImageData = props.vtkImageData
    this.scalarData = props.scalarData
    this.sizeInBytes = props.sizeInBytes
    this.vtkOpenGLTexture = vtkStreamingOpenGLTexture.newInstance()
    this.numVoxels =
      this.dimensions[0] * this.dimensions[1] * this.dimensions[2]

    if (props.scaling) {
      this.scaling = props.scaling
    }
  }
}

export default ImageVolume
