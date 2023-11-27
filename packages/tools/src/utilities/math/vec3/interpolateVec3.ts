/**
 * Linear interpolation between two vec3.
 * Can be used, for example, to interpolate between two RGB colors.
 * @param a - First vec3
 * @param b - Second vec3
 * @param t - Time "t".
 *   - Vector A is returned for values smaller than or equel to 0.
 *   - Vector B is returned for values greater than or equal to 1.
 *   - An interpolation between vectors A and B is returned otherwise.
 * @returns
 */
const interpolateVec3 = (a, b, t) => {
  return [
    a[0] * (1 - t) + b[0] * t,
    a[1] * (1 - t) + b[1] * t,
    a[2] * (1 - t) + b[2] * t,
  ];
};

export { interpolateVec3 as default, interpolateVec3 };
