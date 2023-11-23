interface Inverts {
  invXRadiusSq?: number;
  invYRadiusSq?: number;
  invZRadiusSq?: number;
  fast?: boolean;
}

/**
 * Given an ellipse and a point, return true if the point is inside the ellipse
 * @param ellipse - The ellipse object to check against.
 * @param pointLPS - The point in LPS space to test.
 * @param inverts - An object to cache the inverted radius squared values, if you
 * are testing multiple points against the same ellipse then it is recommended to
 * pass in the same object to cache the values. However, there is a simpler way
 * to do this by passing in the fast flag as true, then on the first iteration
 * the values will be cached and on subsequent iterations the cached values will
 * be used.
 *
 * @returns A boolean value.
 */
export default function pointInEllipse(
  ellipse,
  pointLPS,
  inverts: Inverts = {}
) {
  const { center, xRadius, yRadius, zRadius } = ellipse;

  // This will run only once since we are caching the values in the same
  // object that is passed in.
  if (
    inverts.invXRadiusSq === undefined ||
    inverts.invYRadiusSq === undefined ||
    inverts.invZRadiusSq === undefined
  ) {
    inverts.invXRadiusSq = xRadius !== 0 ? 1 / xRadius ** 2 : 0;
    inverts.invYRadiusSq = yRadius !== 0 ? 1 / yRadius ** 2 : 0;
    inverts.invZRadiusSq = zRadius !== 0 ? 1 / zRadius ** 2 : 0;
  }

  let inside = 0;

  // Calculate the sum of normalized squared distances
  const dx = pointLPS[0] - center[0];
  inside += dx * dx * inverts.invXRadiusSq;
  if (inside > 1) {
    return false;
  }

  const dy = pointLPS[1] - center[1];
  inside += dy * dy * inverts.invYRadiusSq;
  if (inside > 1) {
    return false;
  }

  const dz = pointLPS[2] - center[2];
  inside += dz * dz * inverts.invZRadiusSq;

  // Check if the point is inside the ellipse
  return inside <= 1;
}
