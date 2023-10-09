/**
 * Fast distance calculation between two points
 * @param pointA
 * @param pointB
 * @returns
 */
export function fastPointDistance(pointA, pointB) {
  let distance = 0;
  for (let i = 0; i < pointA.length; i++) {
    distance = distance + Math.abs(pointA[i] - pointB[i]);
  }
  return distance;
}

/**
 * Transforms a point into an string, by converting the numbers with specified number of decimals decimals
 * Default number of decimals is 5
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
