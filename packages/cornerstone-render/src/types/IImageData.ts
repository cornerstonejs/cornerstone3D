import { vtkImageData } from 'vtk.js/Sources/Common/DataModel/ImageData'
import { Point3, Scaling } from '../types'

type IImageData = {
  dimensions: Point3
  direction: Float32Array
  spacing: Point3
  origin: Point3
  scalarData: Float32Array
  imageData: vtkImageData
  metadata: { Modality: string }
  scaling?: Scaling
}

export default IImageData
