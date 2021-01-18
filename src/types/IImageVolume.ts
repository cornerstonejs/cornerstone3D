import Point3 from './Point3'
import Metadata from './Metadata'

interface IImageVolume {
  uid: string
  metadata: Metadata
  dimensions: Point3
  spacing: Array<number>
  origin: Array<number>
  direction: Array<number>
  vtkImageData: object
  scaling?: any
  scalarData: Float32Array | Uint8Array
}

export default IImageVolume
