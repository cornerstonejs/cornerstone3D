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
  handleCount = 12
): PointsArray3 {
  const handles = PointsManager.create3(handleCount) as PointsArray3;
  handles.sources = [];
  const { sources: destPoints } = handles;
  const { length, sources: sourcePoints = [] } = polyline;
  // The distance used for figuring out the local angle of a line
  const distance = 6;
  if (length < distance * 3) {
    return polyline.subselect(handleCount);
  }
  // Need to make the interval between handles long enough to allow for some
  // variation between points in terms of the distance of a line angle, but
  // also not too many handles either.
  // On average, we get twice the interval between handles, so double the length here.
  const interval = Math.floor(
    Math.max((2 * length) / handleCount, distance * 5)
  );
  sourcePoints.forEach(() =>
    destPoints.push(PointsManager.create3(handleCount))
  );

  const dotValues = createDotValues(polyline, distance);

  const minimumRegions = findMinimumRegions(dotValues, handleCount);
  const indices = [];
  if (minimumRegions?.length > 2) {
    let lastHandle = -1;
    const thirdInterval = interval / 3;
    minimumRegions.forEach((region) => {
      const [start, , end] = region;
      const midIndex = Math.ceil((start + end) / 2);
      if (end - lastHandle < thirdInterval) {
        return;
      }
      if (midIndex - start > 2 * thirdInterval) {
        addInterval(indices, lastHandle, start, interval, length);
        lastHandle = addInterval(indices, start, midIndex, interval, length);
      } else {
        lastHandle = addInterval(
          indices,
          lastHandle,
          midIndex,
          interval,
          length
        );
      }
      if (end - lastHandle > thirdInterval) {
        lastHandle = addInterval(indices, lastHandle, end, interval, length);
      }
    });
    const firstHandle = indices[0];
    const lastDistance = indexValue(firstHandle + length - lastHandle, length);
    // Check that there is enough space between the last and first handle to
    // need an extra handle.
    if (lastDistance > 2 * thirdInterval) {
      addInterval(
        indices,
        lastHandle,
        // Don't add a point too close to the first handle
        firstHandle - thirdInterval,
        interval,
        length
      );
    }
  } else {
    const interval = Math.floor(length / handleCount);
    addInterval(indices, -1, length - interval, interval, length);
  }

  indices.forEach((index) => {
    const point = polyline.getPointArray(index);
    handles.push(point);
    sourcePoints.forEach((source, destSourceIndex) =>
      destPoints[destSourceIndex].push(source.getPoint(index))
    );
  });
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
    return [];
  }

  const inflection = [];
  let pair = null;
  let minValue;
  let minIndex = 0;

  for (let i = 0; i < length; i++) {
    const dot = dotValues[i];
    if (dot < max - deviation) {
      if (pair) {
        pair[2] = i;
        if (dot < minValue) {
          minValue = dot;
          minIndex = i;
        }
        pair[1] = minIndex;
      } else {
        minValue = dot;
        minIndex = i;
        pair = [i, i, i];
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
      pair[1] = minIndex;
      pair[2] = length - 1;
      inflection.push(pair);
    }
  }

  return inflection;
}

/**
 * Adds points in between the start and finish.
 * This is currently just the center point for short values and the start/center/end
 * for ranges where the distance between these is at least the increment.
 */
export function addInterval(indices, start, finish, interval, length) {
  if (finish < start) {
    // Always want a positive distance even if the long way round
    finish += length;
  }
  const distance = finish - start;
  const count = Math.ceil(distance / interval);
  if (count <= 0) {
    if (indices[indices.length - 1] !== finish) {
      indices.push(indexValue(finish, length));
    }
    return finish;
  }
  // Don't add the start index, and always add the end index
  for (let i = 1; i <= count; i++) {
    const index = indexValue(start + (i * distance) / count, length);
    indices.push(index);
  }
  return indices[indices.length - 1];
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
