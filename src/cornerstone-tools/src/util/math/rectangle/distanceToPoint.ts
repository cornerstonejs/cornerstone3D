import lineSegment from '../line'
import { Types } from '@cornerstone'

type rectLineSegmentas = {
  top: number[][]
  right: number[][]
  bottom: number[][]
  left: number[][]
}

function rectToLineSegments(
  left: number,
  top: number,
  width: number,
  height: number
): rectLineSegmentas {
  const topLineStart = [left, top]
  const topLineEnd = [left + width, top]

  const rigthLineStart = [left + width, top]
  const rigthLineEnd = [left + width, top + height]

  const bottomLineStart = [left + width, top + height]
  const bottomLineEnd = [left, top + height]

  const leftLineStart = [left, top + height]
  const leftLineEnd = [left, top]

  const lineSegments = {
    top: [topLineStart, topLineEnd],
    right: [rigthLineStart, rigthLineEnd],
    bottom: [bottomLineStart, bottomLineEnd],
    left: [leftLineStart, leftLineEnd],
  }

  return lineSegments
}

/**
 * Calculates distance of the point to the rectangle. It calculates the minimum
 * distance between the point and each line segment of the rectangle.
 *
 * @param rect : coordinates of the rectangle [left, top, width, height]
 * @param point : [x,y] coordinates of a point
 * @returns
 */
export default function distanceToPoint(
  rect: number[],
  point: Types.Point2
): number {
  if (rect.length !== 4 || point.length !== 2) {
    throw Error(
      'rectangle:[left, top, width, height] or point: [x,y] not defined correctly'
    )
  }

  const [left, top, width, height] = rect

  let minDistance = 655535
  const lineSegments = rectToLineSegments(left, top, width, height)

  Object.keys(lineSegments).forEach((segment) => {
    const [lineStart, lineEnd] = lineSegments[segment]
    const distance = lineSegment.distanceToPoint(lineStart, lineEnd, point)

    if (distance < minDistance) {
      minDistance = distance
    }
  })

  return minDistance
}
