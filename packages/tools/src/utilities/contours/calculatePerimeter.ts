/**
 * Calculates the perimeter of a polyline.
 *
 * @param polyline - The polyline represented as an array of points.
 * @param closed - Indicates whether the polyline is closed or not.
 * @returns The perimeter of the polyline.
 */
function calculatePerimeter(polyline: number[][], closed: boolean): number {
  let perimeter = 0;

  for (let i = 0; i < polyline.length - 1; i++) {
    const point1 = polyline[i];
    const point2 = polyline[i + 1];
    perimeter += Math.sqrt(
      Math.pow(point2[0] - point1[0], 2) + Math.pow(point2[1] - point1[1], 2)
    );
  }

  if (closed) {
    const firstPoint = polyline[0];
    const lastPoint = polyline[polyline.length - 1];
    perimeter += Math.sqrt(
      Math.pow(lastPoint[0] - firstPoint[0], 2) +
        Math.pow(lastPoint[1] - firstPoint[1], 2)
    );
  }

  return perimeter;
}

export default calculatePerimeter;
