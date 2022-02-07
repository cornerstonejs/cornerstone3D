import { Point2 } from '../../../types'

type canvasCoordinates = [
  Point2, // bottom
  Point2, // top
  Point2, // left
  Point2 // right
]

export default function getCanvasEllipseCorners(
  canvasCoordinates: canvasCoordinates
): Array<Point2> {
  const [bottom, top, left, right] = canvasCoordinates

  const topLeft = <Point2>[left[0], top[1]]
  const bottomRight = <Point2>[right[0], bottom[1]]

  return [topLeft, bottomRight]
}
