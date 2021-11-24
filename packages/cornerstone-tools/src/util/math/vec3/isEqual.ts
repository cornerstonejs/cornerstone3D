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
  v1: Point3 | Float32Array,
  v2: Point3 | Float32Array,
  tolerance = 1e-5
): boolean {
  if (v1.length !== v2.length) {
    return false
  }

  for (let i = 0; i < v1.length; i++) {
    if (Math.abs(v1[i] - v2[i]) > tolerance) {
      return false
    }
  }

  return true
}
