interface Inverts {
  invXRadiusSq?: number;
  invYRadiusSq?: number;
  invZRadiusSq?: number;
}

/**
 * Given an ellipse and a point, return true if the point is inside the ellipse
 * @param ellipse - The ellipse object to check against.
 * @param pointLPS - The point in LPS space to test.
 * @returns A boolean value.
 */
export default function pointInEllipse(
  ellipse,
  pointLPS,
  inverts: Inverts = {}
) {
  const { center, xRadius, yRadius, zRadius } = ellipse;

  let { invXRadiusSq, invYRadiusSq, invZRadiusSq } = inverts;

  if (
    invXRadiusSq === undefined ||
    invYRadiusSq === undefined ||
    invZRadiusSq === undefined
  ) {
    invXRadiusSq = xRadius !== 0 ? 1 / xRadius ** 2 : 0;
    invYRadiusSq = yRadius !== 0 ? 1 / yRadius ** 2 : 0;
    invZRadiusSq = zRadius !== 0 ? 1 / zRadius ** 2 : 0;
  }

  let inside = 0;

  // Calculate the sum of normalized squared distances
  inside += (pointLPS[0] - center[0]) ** 2 * invXRadiusSq;
  if (inside > 1) {
    return false;
  }

  inside += (pointLPS[1] - center[1]) ** 2 * invYRadiusSq;
  if (inside > 1) {
    return false;
  }

  inside += (pointLPS[2] - center[2]) ** 2 * invZRadiusSq;

  // Check if the point is inside the ellipse
  return inside <= 1;
}
