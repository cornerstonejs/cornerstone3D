import type { Types } from '@cornerstonejs/core';
interface Inverts {
  invXRadiusSq?: number;
  invYRadiusSq?: number;
  invZRadiusSq?: number;
  fast?: boolean;
  /**
   * If you call the pointInEllipse.precalculateInverts first, then you
   * can call precalculated directly instead of having the extra time for
   * the if conditions.
   */
  precalculated?: (pointLPS: Types.Point3) => boolean;
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
  if (!inverts.precalculated) {
    precalculatePointInEllipse(ellipse, inverts);
  }
  return inverts.precalculated(pointLPS);
}

/**
 * This will perform some precalculations to make things faster.
 * Ideally, use the 'precalculated' function inside inverts to call the
 * test function.  This minimizes re-reading of variables and only needs the
 * LPS passed each time.
 * That is:
 *
 * ```
 *    const inverts = precalculatePointInEllipse(ellipse);
 *    if( inverts.precalculated(pointLPS) ) ...
 * ```
 */
const precalculatePointInEllipse = (ellipse, inverts: Inverts = {}) => {
  const { xRadius, yRadius, zRadius } = ellipse;

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

  const { invXRadiusSq, invYRadiusSq, invZRadiusSq } = inverts;
  const { center } = ellipse;
  const [centerL, centerP, centerS] = center;

  inverts.precalculated = (pointLPS) => {
    // Calculate the sum of normalized squared distances
    const dx = pointLPS[0] - centerL;
    let inside = dx * dx * invXRadiusSq;
    if (inside > 1) {
      return false;
    }

    const dy = pointLPS[1] - centerP;
    inside += dy * dy * invYRadiusSq;
    if (inside > 1) {
      return false;
    }

    const dz = pointLPS[2] - centerS;
    inside += dz * dz * invZRadiusSq;

    // Check if the point is inside the ellipse
    return inside <= 1;
  };

  return inverts;
};

export { precalculatePointInEllipse };
