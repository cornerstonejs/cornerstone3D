import { vec3 } from 'gl-matrix';

/**
 * Checks if a plane intersects with an Axis-Aligned Bounding Box (AABB).
 *
 * @param origin - The origin point of the plane.
 * @param normal - The normal vector of the plane.
 * @param minX - The minimum x-coordinate of the AABB.
 * @param minY - The minimum y-coordinate of the AABB.
 * @param minZ - The minimum z-coordinate of the AABB.
 * @param maxX - The maximum x-coordinate of the AABB.
 * @param maxY - The maximum y-coordinate of the AABB.
 * @param maxZ - The maximum z-coordinate of the AABB.
 * @returns A boolean indicating whether the plane intersects with the AABB.
 */
export const isPlaneIntersectingAABB = (
  origin,
  normal,
  minX,
  minY,
  minZ,
  maxX,
  maxY,
  maxZ
) => {
  const vertices = [
    vec3.fromValues(minX, minY, minZ),
    vec3.fromValues(maxX, minY, minZ),
    vec3.fromValues(minX, maxY, minZ),
    vec3.fromValues(maxX, maxY, minZ),
    vec3.fromValues(minX, minY, maxZ),
    vec3.fromValues(maxX, minY, maxZ),
    vec3.fromValues(minX, maxY, maxZ),
    vec3.fromValues(maxX, maxY, maxZ),
  ];

  const normalVec = vec3.fromValues(normal[0], normal[1], normal[2]);
  const originVec = vec3.fromValues(origin[0], origin[1], origin[2]);

  // Compute the distance from the plane to the origin using vec3.dot
  const planeDistance = -vec3.dot(normalVec, originVec);

  // Check if all vertices are on the same side of the plane
  let initialSign = null;
  for (const vertex of vertices) {
    // Calculate distance using vec3.dot to simplify the equation
    const distance = vec3.dot(normalVec, vertex) + planeDistance;
    if (initialSign === null) {
      initialSign = Math.sign(distance);
    } else if (Math.sign(distance) !== initialSign) {
      return true; // Found a vertex on the other side, so it intersects
    }
  }

  return false;
};
