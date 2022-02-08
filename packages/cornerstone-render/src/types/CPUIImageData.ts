import { Point3, Scaling } from '../types'

type IImageData = {
  dimensions: Point3
  direction: Float32Array
  spacing: Point3
  origin: Point3
  imageData: {
    worldToIndex?: (point: Point3) => Point3
    indexToWorld?: (point: Point3) => Point3
    getWorldToIndex?: () => Point3
    getIndexToWorld?: () => Point3
    getSpacing?: () => Point3
    getDirection?: () => Float32Array
  }
  metadata: { Modality: string }
  scalarData: number[]
  scaling: Scaling
}

export default IImageData
