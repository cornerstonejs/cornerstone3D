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
  // Define the vertices of the AABB
  const vertices = [
    [minX, minY, minZ],
    [maxX, minY, minZ],
    [minX, maxY, minZ],
    [maxX, maxY, minZ],
    [minX, minY, maxZ],
    [maxX, minY, maxZ],
    [minX, maxY, maxZ],
    [maxX, maxY, maxZ],
  ];

  // Compute the distance from the plane to the origin
  const planeDistance = -(
    normal[0] * origin[0] +
    normal[1] * origin[1] +
    normal[2] * origin[2]
  );

  // Check if all vertices are on the same side of the plane
  let initialSign = null;
  for (const vertex of vertices) {
    const [x, y, z] = vertex;
    const distance =
      normal[0] * x + normal[1] * y + normal[2] * z + planeDistance;
    if (initialSign === null) {
      initialSign = Math.sign(distance);
    } else if (Math.sign(distance) !== initialSign) {
      return true; // Found a vertex on the other side, so it intersects
    }
  }

  // All vertices are on one side; no intersection
  return false;
};
