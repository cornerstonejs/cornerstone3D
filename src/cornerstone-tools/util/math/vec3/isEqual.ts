import { Point3 } from '../../../types'

/**
 * @function isEqual returns equal if the two vec3s are identical within the
 * given tolerance in each dimension.
 *
 * @param {Point3} v1 - The first 3 vector
 * @param {Point3} v2 - The second 3 vector.
 * @param {number} [tolerance = 1e-5] The acceptable tolerance.
 *
 * @returns {boolean} True if the two values are within the tolerance levels.
 */
export default function isEqual(
  v1: Point3,
  v2: Point3,
  tolerance = 1e-5
): boolean {
  return (
    Math.abs(v1[0] - v2[0]) < tolerance &&
    Math.abs(v1[1] - v2[1]) < tolerance &&
    Math.abs(v1[2] - v2[2]) < tolerance
  )
}
