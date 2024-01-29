import { vec3 } from 'gl-matrix';
import { PointsArray } from '../PointsArray';
import type { PointsArray3 } from './interpolate';

/**
 * Selects handles by looking for local maximums in the angle that the local
 * vector makes
 */
export default function selectHandles(
  interpolated3DPoints,
  handleCount
): PointsArray3 {
  const handles = PointsArray.create3(handleCount) as PointsArray3;
  handles.sources = [];
  const { sources: destPoints } = handles;
  const distance = 6;
  const { length, sources: sourcePoints = [] } = interpolated3DPoints;
  if (length < distance * 2) {
    return interpolated3DPoints.subselect(3);
  }
  const prevVec3 = vec3.create();
  const nextVec3 = vec3.create();
  const dotValues = new Float32Array(length);
  const interval = Math.floor(length / handleCount / 4);
  sourcePoints.forEach(() => destPoints.push(PointsArray.create3(handleCount)));

  for (let i = 0; i < length; i++) {
    const point = interpolated3DPoints.getPoint(i);
    const prevPoint = interpolated3DPoints.getPoint(i - distance);
    const nextPoint = interpolated3DPoints.getPoint((i + distance) % length);
    vec3.sub(prevVec3, point, prevPoint);
    vec3.scale(prevVec3, prevVec3, 1 / vec3.length(prevVec3));
    vec3.sub(nextVec3, nextPoint, point);
    vec3.scale(nextVec3, nextVec3, 1 / vec3.length(nextVec3));
    const dot = vec3.dot(prevVec3, nextVec3);
    dotValues[i] = dot;
  }

  const inflectionIndices = findInflectionPoints(dotValues, handleCount);
  if (inflectionIndices?.length > 2) {
    inflectionIndices.forEach((index) => {
      handles.push(interpolated3DPoints.getPoint(index));
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
    handles.push(interpolated3DPoints.getPoint(minIndex));
    sourcePoints.forEach((source, index) =>
      destPoints[index].push(source.getPoint(minIndex))
    );
  }

  return handles;
}

function findInflectionPoints(dotValues, handleCount) {
  const { mean, max, min, deviation } = getStats(dotValues);
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

function addIncrement(indices, start, finish, increment, length) {
  const distance = indexValue(finish - start, length);
  if (distance >= increment * 2) {
    indices.push(start, indexValue(start + distance / 2, length), finish);
    return indices;
  }
  indices.push(indexValue(start + distance / 2, length));
  return indices;
}

function indexValue(v, length) {
  return (Math.round(v) + length) % length;
}

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
    sumSq += (dotValues[i] - mean) ** 2;
  }
  return {
    mean: sum / length,
    max,
    min,
    sumSq,
    deviation: Math.sqrt(sumSq / length),
  };
}
