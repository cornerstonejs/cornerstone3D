/**
 * Minimal synthetic volume geometry for exercising voxel iteration without a
 * rendering engine, a cache, or any image loading.
 *
 * Only the geometry matters for Rule M, so this deliberately carries nothing
 * but dimensions, spacing, direction and origin, plus the index->world mapping
 * they imply.
 */

/**
 * @param {object} options
 * @param {[number, number, number]} options.dimensions - voxel counts per axis
 * @param {[number, number, number]} [options.spacing] - mm per voxel per axis
 * @param {number[]} [options.direction] - 9 element row-major matrix whose rows
 *   are the unit direction vectors of the i, j and k axes
 * @param {[number, number, number]} [options.origin] - world position of voxel (0,0,0)
 */
export function createSyntheticVolume({
  dimensions,
  spacing = [1, 1, 1],
  direction = [1, 0, 0, 0, 1, 0, 0, 0, 1],
  origin = [0, 0, 0],
}) {
  const iVector = direction.slice(0, 3);
  const jVector = direction.slice(3, 6);
  const kVector = direction.slice(6, 9);

  const indexToWorld = ([i, j, k], out = [0, 0, 0]) => {
    for (let axis = 0; axis < 3; axis++) {
      out[axis] =
        origin[axis] +
        i * spacing[0] * iVector[axis] +
        j * spacing[1] * jVector[axis] +
        k * spacing[2] * kVector[axis];
    }
    return out;
  };

  return { dimensions, spacing, direction, origin, indexToWorld };
}

/**
 * A direction matrix rotated by `degrees` about the given axis, for building
 * oblique cases. Rows remain orthonormal.
 *
 * @param {number} degrees
 * @param {'x'|'y'|'z'} axis
 */
export function rotatedDirection(degrees, axis = 'x') {
  const radians = (degrees * Math.PI) / 180;
  const c = Math.cos(radians);
  const s = Math.sin(radians);

  if (axis === 'x') {
    return [1, 0, 0, 0, c, -s, 0, s, c];
  }
  if (axis === 'y') {
    return [c, 0, s, 0, 1, 0, -s, 0, c];
  }
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}

/**
 * The unit normal of the k (slice) axis for a direction matrix, i.e. the
 * acquisition-orientation view plane normal.
 */
export function acquisitionNormal(direction) {
  return direction.slice(6, 9);
}

/**
 * A unit vector `degrees` away from `acquisitionNormal`, rotated in the plane
 * spanned by the k axis and the i axis. Useful for building oblique normals
 * that are deliberately not close to any voxel axis.
 */
export function obliqueNormal(direction, degrees) {
  const radians = (degrees * Math.PI) / 180;
  const iVector = direction.slice(0, 3);
  const kVector = direction.slice(6, 9);
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  const normal = [0, 0, 0];
  for (let axis = 0; axis < 3; axis++) {
    normal[axis] = c * kVector[axis] + s * iVector[axis];
  }
  return normal;
}
