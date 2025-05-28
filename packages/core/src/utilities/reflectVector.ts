import { vec3 } from 'gl-matrix';

/**
 * Reflects a vector `v` over a given normal vector.
 *
 * @param v - The vector to reflect.
 * @param normal - The normal vector to reflect over.
 * @returns The reflected vector.
 */
export function reflectVector(v: vec3, normal: vec3): vec3 {
  const dotProduct = vec3.dot(v, normal);
  const scaledNormal = vec3.scale(vec3.create(), normal, 2 * dotProduct);
  return vec3.sub(vec3.create(), v, scaledNormal);
}
