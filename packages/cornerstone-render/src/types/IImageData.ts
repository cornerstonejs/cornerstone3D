import { vtkImageData } from 'vtk.js/Sources/Common/DataModel/ImageData'
import { Point3, Scaling } from '../types'

type IImageData = {
  dimensions: Point3
  direction: Float32Array
  scalarData: Float32Array
  vtkImageData: vtkImageData
  metadata: { Modality: string }
  scaling?: Scaling
}

export default IImageData
