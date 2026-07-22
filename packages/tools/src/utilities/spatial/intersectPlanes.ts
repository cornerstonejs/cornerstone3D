import { vec3 } from 'gl-matrix';
import type { Plane, WorldLine } from './types';

/**
 * Two planes whose normals have a cross product shorter than this are treated
 * as parallel (numerically unstable to intersect).
 */
const PARALLEL_EPSILON = 1e-6;

/**
 * Computes the intersection line of two planes.
 *
 * Returns null when the planes are parallel (or numerically too close to
 * parallel to produce a stable line). Otherwise returns a stable point on the
 * line and the normalized line direction. The returned point is deterministic
 * for a given pair of planes and does not depend on any external "center"
 * point.
 */
export default function intersectPlanes(
  planeA: Plane,
  planeB: Plane
): WorldLine | null {
  if (!planeA || !planeB) {
    return null;
  }

  const normalA = vec3.normalize(vec3.create(), planeA.normal);
  const normalB = vec3.normalize(vec3.create(), planeB.normal);

  const direction = vec3.cross(vec3.create(), normalA, normalB);
  const directionLengthSquared = vec3.squaredLength(direction);

  if (directionLengthSquared < PARALLEL_EPSILON * PARALLEL_EPSILON) {
    return null;
  }

  // Plane offsets in Hessian normal form: dot(n, x) = d
  const dA = vec3.dot(normalA, planeA.point);
  const dB = vec3.dot(normalB, planeB.point);

  // Closed-form point on the intersection line:
  // p = (dA * (nB x dir) + dB * (dir x nA)) / |dir|^2
  // which satisfies dot(nA, p) = dA and dot(nB, p) = dB.
  const nBCrossDir = vec3.cross(vec3.create(), normalB, direction);
  const dirCrossNA = vec3.cross(vec3.create(), direction, normalA);

  const point = vec3.create();
  vec3.scaleAndAdd(point, point, nBCrossDir, dA);
  vec3.scaleAndAdd(point, point, dirCrossNA, dB);
  vec3.scale(point, point, 1 / directionLengthSquared);

  vec3.normalize(direction, direction);

  if (
    ![...point, ...direction].every((component) => Number.isFinite(component))
  ) {
    return null;
  }

  return {
    point: [point[0], point[1], point[2]],
    direction: [direction[0], direction[1], direction[2]],
  };
}
