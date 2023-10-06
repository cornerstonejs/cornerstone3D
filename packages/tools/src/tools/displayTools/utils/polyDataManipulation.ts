import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkCellArray from '@kitware/vtk.js/Common/Core/CellArray';
import { getPoint } from './pointFunctions';

function getNearestPoint(nextToFind, points, pointsUsed) {
  const reference = getPoint(points, nextToFind);
  let winner = -1;
  let minDistance = 10000000;
  pointsUsed.forEach((pointUsed) => {
    const point = getPoint(points, pointUsed);
    const distance =
      Math.abs(reference[0] - point[0]) +
      Math.abs(reference[1] - point[1]) +
      Math.abs(reference[2] - point[2]);
    if (minDistance > distance) {
      minDistance = distance;
      winner = pointUsed;
    }
  });
  if (minDistance < 1) {
    return winner;
  } else {
    return -1;
  }
}

function getAvailablePoints(tupleArray) {
  const availablePoints = [];
  for (let i = 0; i < tupleArray.length; i++) {
    if (tupleArray[i]) {
      availablePoints.push(i);
    }
  }
  return availablePoints;
}

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

  const pointIndexesArray = [];
  // uniting all tuples in a consecutive point set
  let nextToFind;
  nextToFind = getFirstAvailable(tupleArray);
  if (nextToFind === -1) {
    return;
  }
  pointIndexesArray.push(nextToFind);
  while (tupleArray[nextToFind]) {
    const indexToAdd = tupleArray[nextToFind][1];
    if (tupleArray[indexToAdd]) {
      pointIndexesArray.push(indexToAdd);
    }
    tupleArray[nextToFind] = undefined;
    nextToFind = indexToAdd;
  }
  pointIndexesArray.push(...pointIndexesArray);
  return pointIndexesArray;
}

/**
 * Converts a contour polydata into a closed polygon
 * @param polyData
 * @returns
 */
function convertContourToPolygon(polyData) {
  const newPolyData = vtkPolyData.newInstance();
  const points = polyData.getPoints().getData();
  newPolyData.getPoints().setData(points, 3);

  const polyArray = getPolyDataPointIndexes(polyData);
  polyArray.unshift(polyArray.length);
  const polygon = vtkCellArray.newInstance({
    values: Uint32Array.from(polyArray),
  });
  newPolyData.setPolys(polygon);
  return newPolyData;
}

export function getPolyDataPoints(polyData) {
  const pointIndexes = getPolyDataPointIndexes(polyData);
  const points = polyData.getPoints().getData();
  if (pointIndexes) {
    return pointIndexes.map((pointIndex) => getPoint(points, pointIndex));
  }
}
