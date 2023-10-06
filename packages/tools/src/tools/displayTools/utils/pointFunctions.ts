/**
 * Transforms a point into an string, by converting the numbers with five decimals
 * @param point
 * @returns
 */
export function pointToString(point, decimals = 5) {
  return (
    parseFloat(point[0]).toFixed(decimals) +
    ',' +
    parseFloat(point[1]).toFixed(decimals) +
    ',' +
    parseFloat(point[2]).toFixed(decimals) +
    ','
  );
}

/**
 * Gets a point from an array of numbers given its index
 * @param points array of number, each point defined by three consecutive numbers
 * @param idx index of the point to retrieve
 * @returns
 */
export function getPoint(points, idx) {
  if (idx < points.length / 3) {
    return [points[idx * 3], points[idx * 3 + 1], points[idx * 3 + 2]];
  }
}
