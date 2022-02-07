import { vtkImageData } from 'vtk.js/Sources/Common/DataModel/ImageData'
import Point3 from './Point3'
import Metadata from './Metadata'

interface IVolume {
  uid: string
  metadata: Metadata
  dimensions: Point3
  spacing: Point3
  origin: Point3
  direction: Array<number>
  scalarData: Float32Array | Uint8Array
  sizeInBytes?: number
  imageData?: vtkImageData
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
}

export default IVolume
