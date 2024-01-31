import { vec3 } from 'gl-matrix';
import { utilities } from '@cornerstonejs/core';
import type { PointsArray3 } from './interpolate';

const { PointsManager } = utilities;

/**
 * Selects handles by looking for local maximums in the angle that the local
 * vector makes
 *
 * @param polyline - an array of points, usually the polyline for the contour to
 *        select handles from.
 * @param handleCount - a guideline for how many handles to create
 */
export default function selectHandles(
  polyline: PointsArray3,
  handleCount: number
): PointsArray3 {
  const handles = PointsManager.create3(handleCount) as PointsArray3;
  handles.sources = [];
  const { sources: destPoints } = handles;
  const { length, sources: sourcePoints = [] } = polyline;
  const distance = 6;
  if (length < distance * 2) {
    return polyline.subselect(3);
  }
  const interval = Math.floor(length / handleCount / 4);
  sourcePoints.forEach(() =>
    destPoints.push(PointsManager.create3(handleCount))
  );

  const dotValues = createDotValues(polyline, distance);

  const inflectionIndices = findMinimumRegions(dotValues, handleCount);
  if (inflectionIndices?.length > 2) {
    inflectionIndices.forEach((index) => {
      handles.push(polyline.getPoint(index));
      sourcePoints.forEach((source, destSourceIndex) =>
        destPoints[destSourceIndex].push(source.getPoint(index))
      );
    });
    return handles;
  }

  for (let i = 0; i < handleCount; i++) {
    const centerIndex = Math.floor((length * i) / handleCount);
    let minIndex = centerIndex;
    let minValue = dotValues[centerIndex];
    for (let j = 0; j < 2 * interval; j++) {
      // Start with values near the index, then move outward
      const jSigned = j % 2 ? -(j - 1) / 2 : j / 2;
      const testIndex = (centerIndex + jSigned + length) % length;
      if (dotValues[testIndex] < minValue) {
        minValue = dotValues[testIndex];
        minIndex = testIndex;
      }
    }
    handles.push(polyline.getPoint(minIndex));
    sourcePoints.forEach((source, index) =>
      destPoints[index].push(source.getPoint(minIndex))
    );
  }

  return handles;
}

/**
 * Creates an array of the dot products between each point in the points array
 * and a point +/- distance from that point, unitized to vector length 1.
 * That is, this is a measure of the angle at the given point, where 1 is a
 * straight line, and -1 is a 180 degree angle change.
 *
 * @param polyline - the array of Point3 values
 * @param distance - previous/next distance to use for the vectors for the dot product
 * @returns - Float32Array of dot products, one per point in the source array.
 */
export function createDotValues(
  polyline: PointsArray3,
  distance = 6
): Float32Array {
  const { length } = polyline;
  const prevVec3 = vec3.create();
  const nextVec3 = vec3.create();
  const dotValues = new Float32Array(length);

  for (let i = 0; i < length; i++) {
    const point = polyline.getPoint(i);
    const prevPoint = polyline.getPoint(i - distance);
    const nextPoint = polyline.getPoint((i + distance) % length);
    vec3.sub(prevVec3, point, prevPoint);
    vec3.sub(nextVec3, nextPoint, point);
    const dot =
      vec3.dot(prevVec3, nextVec3) / (vec3.len(prevVec3) * vec3.len(nextVec3));
    dotValues[i] = dot;
  }

  return dotValues;
}

/**
 * Finds minimum regions in the dot products.  These are detected as
 * center points of the dot values regions having a minimum value - that is,
 * where the direction of the line is changing fastest.
 */
function findMinimumRegions(dotValues, handleCount) {
  const { max, deviation } = getStats(dotValues);
  const { length } = dotValues;
  // Fallback for very uniform ojects.
  if (deviation < 0.01 || length < handleCount * 3) {
    // TODO - create handleCount evenly spaced handles
    return [0, Math.floor(length / 3), Math.floor((length * 2) / 3)];
  }

  const inflection = [];
  let pair = null;
  for (let i = 0; i < length; i++) {
    const dot = dotValues[i];
    if (dot < max - deviation) {
      if (pair) {
        pair[1] = i;
      } else {
        pair = [i, i];
      }
    } else {
      if (pair) {
        inflection.push(pair);
        pair = null;
      }
    }
  }
  if (pair) {
    if (inflection[0][0] === 0) {
      inflection[0][0] = pair[0];
    } else {
      pair[1] = length - 1;
      inflection.push(pair);
    }
  }
  const selectedIndices = [];
  const increment = 10;
  for (let i = 0; i < inflection.length; i++) {
    const lastInflection =
      inflection[(i - 1 + inflection.length) % inflection.length];
    const current = inflection[i];
    const [start, finish] = current;
    const distanceLast = indexValue(start - lastInflection[1], length);
    if (distanceLast > increment) {
      const previousMidpoint = indexValue(start - distanceLast / 2, length);
      selectedIndices.push(previousMidpoint);
    }
    addIncrement(selectedIndices, start, finish, increment, length);
  }
  return selectedIndices;
}

/**
 * Adds points in between the start and finish.
 * This is currently just the center point for short values and the start/center/end
 * for ranges where the distance between these is at least the increment.
 */
function addIncrement(indices, start, finish, increment, length) {
  const distance = indexValue(finish - start, length);
  if (distance >= increment * 2) {
    indices.push(start, indexValue(start + distance / 2, length), finish);
    return indices;
  }
  indices.push(indexValue(start + distance / 2, length));
  return indices;
}

/**
 * Gets the index value of a closed polyline, rounding the value and
 * doing the module operation as required.
 */
function indexValue(v, length) {
  return (Math.round(v) + length) % length;
}

/**
 * Gets statistics on the provided array numbers.
 */
function getStats(dotValues) {
  const { length } = dotValues;
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  let sumSq = 0;
  for (let i = 0; i < length; i++) {
    const dot = dotValues[i];
    sum += dot;
    min = Math.min(min, dot);
    max = Math.max(max, dot);
  }
  const mean = sum / length;
  for (let i = 0; i < length; i++) {
    const valueDiff = dotValues[i] - mean;
    sumSq += valueDiff * valueDiff;
  }
  return {
    mean,
    max,
    min,
    sumSq,
    deviation: Math.sqrt(sumSq / length),
  };
}
