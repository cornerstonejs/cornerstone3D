import { getPoint } from './pointFunctions';

function getFirstAvailable(tupleArray) {
  for (let i = 0; i < tupleArray.length; i++) {
    if (tupleArray[i]) {
      return tupleArray[i][0];
    }
  }
  return -1;
}

export function getPolyDataPointIndexes(polyData) {
  const linesData = polyData.getLines().getData();

  // creating array of tuples. A tuple is a segment of two points. Its not required
  // that two consecutive tuples are connected
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
 * Extract contour points from a polydata object
 * @param polyData
 * @returns
 */
export function getPolyDataPoints(polyData) {
  const contoursPointIndexes = getPolyDataPointIndexes(polyData);
  const points = polyData.getPoints().getData();
  if (contoursPointIndexes) {
    return contoursPointIndexes.map((contourPointIndexes) =>
      contourPointIndexes.map((pointIndex) => getPoint(points, pointIndex))
    );
  }
}
