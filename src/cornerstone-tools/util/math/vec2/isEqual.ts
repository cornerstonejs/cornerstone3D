import { Point2 } from '../../../types'

/**
 * @function isEqual returns equal if the two vec2s are identical within the
 * given tolerance in each dimension.
 *
 * @param {Point2} v1 - The first 2 vector
 * @param {Point2} v2 - The second 2 vector.
 * @param {number} [tolerance = 1e-5] The acceptable tolerance.
 *
 * @returns {boolean} True if the two values are within the tolerance levels.
 */
export default function isEqual(
  v1: Point2,
  v2: Point2,
  tolerance = 1e-5
): boolean {
  return (
    Math.abs(v1[0] - v2[0]) < tolerance && Math.abs(v1[1] - v2[1]) < tolerance
  )
}
