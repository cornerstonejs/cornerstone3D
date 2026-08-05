import type { Types } from '@cornerstonejs/core';

/**
 * Computes the intersections between a horizontal scanline and a polygon.
 *
 * Uses the half-open edge rule (`yMin <= scanY < yMax`) to avoid duplicate
 * vertex intersections and guarantee an even number of crossings for a valid
 * simple polygon. Horizontal edges are ignored implicitly.
 *
 * @param points - Polygon vertices in canvas coordinates.
 * @param scanY - Y coordinate of the scanline.
 * @param startX - Start X coordinate of the scanline.
 * @param endX - End X coordinate of the scanline.
 * @param closed - Whether the polygon is closed.
 * @returns The scanline intersection points, sorted by ascending X coordinate.
 */
export default function getScanLineIntersections(
  points: Types.Point2[],
  scanY: number,
  startX: number,
  endX: number,
  closed = true
): Types.Point2[] {
  const intersections: Types.Point2[] = [];
  const numPoints = points.length;
  const maxI = closed ? numPoints - 1 : numPoints - 2;

  for (let i = 0; i <= maxI; i++) {
    const j = (i + 1) % numPoints;

    const [x1, y1] = points[i];
    const [x2, y2] = points[j];

    const yMin = Math.min(y1, y2);
    const yMax = Math.max(y1, y2);

    // Half-open rule
    if (scanY < yMin || scanY >= yMax) {
      continue;
    }

    const interpolationFactor = (scanY - y1) / (y2 - y1);
    const intersectionX = x1 + interpolationFactor * (x2 - x1);

    if (intersectionX >= startX && intersectionX <= endX) {
      intersections.push([intersectionX, scanY]);
    }
  }

  intersections.sort((a, b) => a[0] - b[0]);

  return intersections;
}
