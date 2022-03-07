import Point3 from './Point3'

type AnnotationHandle = Point3

type TextBoxHandle = {
  hasMoved: boolean
  worldBoundingBox: {
    bottomLeft: Point3
    bottomRight: Point3
    topLeft: Point3
    topRight: Point3
  }
  worldPosition: Point3
}

type ToolHandle = AnnotationHandle | TextBoxHandle

export default ToolHandle
export type { AnnotationHandle, TextBoxHandle }
