import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';

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

/**
 * Returns the first available point in a tuple array
 * @param tupleArray
 * @returns
 */
function getFirstAvailable(tupleArray) {
  for (let i = 0; i < tupleArray.length; i++) {
    if (tupleArray[i]) {
      return tupleArray[i][0];
    }
  }
  return -1;
}

/**
 * Extract contour point sets from the outline of a poly data actor
 * @param polyData - vtk polyData
 * @returns
 */
export function getPolyDataPointIndexes(polyData: vtkPolyData) {
  const linesData = polyData.getLines().getData();

  // creating array of tuples. A tuple is pair of points that defines a line segment.
  // Its not required that two consecutive tuples are connected
  let idx = 0;
  const tupleArray = [];
  while (idx < linesData.length) {
    const size = linesData[idx];
    idx++;
    const tuple = [];
    for (let i = 0; i < size; i++) {
      tuple.push(linesData[idx + i]);
    }
    tupleArray[tuple[0]] = tuple;
    idx = idx + size;
  }

  const contoursArray = [];
  // while there is active points, create contour point sets
  while (getFirstAvailable(tupleArray) > -1) {
    // uniting all tuples in a consecutive point set
    let nextToFind;
    nextToFind = getFirstAvailable(tupleArray);
    if (nextToFind === -1) {
      return;
    }
    const contourPoints = [];
    contourPoints.push(nextToFind);
    while (tupleArray[nextToFind]) {
      const indexToAdd = tupleArray[nextToFind][1];
      if (tupleArray[indexToAdd]) {
        contourPoints.push(indexToAdd);
      }
      tupleArray[nextToFind] = undefined;
      nextToFind = indexToAdd;
    }
    contoursArray.push(contourPoints);
  }
  return contoursArray;
}

/**
 * Extract contour points from a poly data object
 * @param polyData - vtk polyData
 * @returns
 */
export function getPolyDataPoints(polyData: vtkPolyData) {
  const contoursIndexes = getPolyDataPointIndexes(polyData);
  if (!contoursIndexes) {
    return;
  }

  const rawPointsData = polyData.getPoints().getData();
  return contoursIndexes.map((contourIndexes) =>
    contourIndexes.map((index) => getPoint(rawPointsData, index))
  );
}
