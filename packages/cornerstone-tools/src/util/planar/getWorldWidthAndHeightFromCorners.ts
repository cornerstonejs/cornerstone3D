import { Point3 } from '../../types'
import { vec3 } from 'gl-matrix'

/**
 * @function getWorldWidthAndHeightFromCorners Given two world positions and an
 * orthogonal view to an `imageVolume` defined by a `viewPlaneNormal` and a
 * `viewUp`, get the width and height in world coordinates of the rectangle
 * defined by the two points. The implementation works both with orthogonal
 * non-orthogonal rectangles.
 *
 * @param {Point3} viewPlaneNormal The normal of the view.
 * @param {Point3} viewUp The up direction of the view.
 * @param {object} imageVolume The imageVolume to use to measure.
 * @param {Point3} topLeftWorld The first world position.
 * @param {Point3} bottomRightWorld The second world position.
 *
 * @returns {object} The `worldWidth` and `worldHeight`.
 */
export default function getWorldWidthAndHeightFromCorners(
  viewPlaneNormal: Point3,
  viewUp: Point3,
  topLeftWorld: Point3,
  bottomRightWorld: Point3
): { worldWidth: number; worldHeight: number } {
  let viewRight = vec3.create()

  vec3.cross(viewRight, <vec3>viewUp, <vec3>viewPlaneNormal)

  viewRight = [-viewRight[0], -viewRight[1], -viewRight[2]]

  const pos1 = vec3.fromValues(...topLeftWorld)
  const pos2 = vec3.fromValues(...bottomRightWorld)

  const diagonal = vec3.create()
  vec3.subtract(diagonal, pos1, pos2)

  const diagonalLength = vec3.length(diagonal)

  // When the two points are very close to each other return width as 0
  // to avoid NaN the cosTheta formula calculation
  if (diagonalLength < 0.0001) {
    return { worldWidth: 0, worldHeight: 0 }
  }

  const cosTheta =
    vec3.dot(diagonal, viewRight) / (diagonalLength * vec3.length(viewRight))

  const sinTheta = Math.sqrt(1 - cosTheta * cosTheta)

  const worldWidth = sinTheta * diagonalLength
  const worldHeight = cosTheta * diagonalLength

  return { worldWidth, worldHeight }
}
