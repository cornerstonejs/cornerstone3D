import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import type { Types } from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';

/**
 * Gets a point from an array of numbers given its index
 * @param points - array of number, each point defined by three consecutive numbers
 * @param idx - index of the point to retrieve
 * @returns
 */
export function getPoint(points, idx): Types.Point3 {
  const idx3 = idx * 3;
  if (idx3 < points.length) {
    return vec3.fromValues(
      points[idx3],
      points[idx3 + 1],
      points[idx3 + 2]
    ) as Types.Point3;
  }
}

/**
 * Extract contour point sets from the outline of a poly data actor
 * @param polyData - vtk polyData
 * @returns
 */
export function getPolyDataPointIndexes(polyData: vtkPolyData) {
  const linesData = polyData.getLines().getData();
  let idx = 0;
  const lineSegments = new Map<number, number[]>();

  // Populate lineSegments map
  while (idx < linesData.length) {
    const segmentSize = linesData[idx++];
    const segment = [];
    for (let i = 0; i < segmentSize; i++) {
      segment.push(linesData[idx + i]);
    }
    lineSegments.set(segment[0], segment);
    idx += segmentSize;
  }

  const contours = [];

  // Function to find an available starting point
  const findStartingPoint = (map) => {
    for (const [key, value] of map.entries()) {
      if (value !== undefined) {
        return key;
      }
    }
    return -1;
  };

  // Build contours
  let startPoint = findStartingPoint(lineSegments);
  while (startPoint !== -1) {
    const contour = [startPoint];
    while (lineSegments.has(startPoint)) {
      const nextPoint = lineSegments.get(startPoint)[1];
      if (lineSegments.has(nextPoint)) {
        contour.push(nextPoint);
      }
      lineSegments.delete(startPoint);
      startPoint = nextPoint;
    }
    contours.push(contour);
    startPoint = findStartingPoint(lineSegments);
  }

  return contours.length ? contours : undefined;
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
