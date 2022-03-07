import { Point3, Scaling, Point2 } from '../types'

type IImageData = {
  dimensions: Point2
  direction: Float32Array
  spacing: Point2
  origin: Point3
  imageData: {
    worldToIndex?: (point: Point3) => Point3
    indexToWorld?: (point: Point3) => Point3
    getWorldToIndex?: () => Point3
    getIndexToWorld?: () => Point3
    getSpacing?: () => Point2
    getDirection?: () => Float32Array
  }
  metadata: { Modality: string }
  scalarData: number[]
  scaling: Scaling
}

export default IImageData
