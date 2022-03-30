import type { Types } from '@cornerstonejs/core';

type Ellipse = {
  center: Types.Point3;
  xRadius: number;
  yRadius: number;
  zRadius: number;
};

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
  if (xRadius !== 0) {
    inside += ((x - x0) * (x - x0)) / (xRadius * xRadius);
  }

  if (yRadius !== 0) {
    inside += ((y - y0) * (y - y0)) / (yRadius * yRadius);
  }

  if (zRadius !== 0) {
    inside += ((z - z0) * (z - z0)) / (zRadius * zRadius);
  }

  return inside <= 1;
}
