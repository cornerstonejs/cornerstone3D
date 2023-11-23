/**
 * Given an ellipse and a point, return true if the point is inside the ellipse
 * @param ellipse - The ellipse object to check against.
 * @param pointLPS - The point in LPS space to test.
 * @returns A boolean value.
 */
export default function pointInEllipse(
  ellipse: Ellipse,
  pointLPS: Types.Point3
): boolean {
  const { center: circleCenterWorld, xRadius, yRadius, zRadius } = ellipse;
  const [x, y, z] = pointLPS;
  const [x0, y0, z0] = circleCenterWorld;

  let inside = 0;

  // Calculate the sum of normalized squared distances
  inside += (pointLPS[0] - center[0]) ** 2 * invXRadiusSqToUse;
  if (inside > 1) {
    return false;
  }

  inside += (pointLPS[1] - center[1]) ** 2 * invYRadiusSqToUse;
  if (inside > 1) {
    return false;
  }

  inside += (pointLPS[2] - center[2]) ** 2 * invZRadiusSqToUse;

  // Check if the point is inside the ellipse
  return inside <= 1;
}
