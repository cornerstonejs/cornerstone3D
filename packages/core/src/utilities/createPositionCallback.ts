import * as vec3 from 'gl-matrix/vec3';
import PointsManager from './PointsManager';
import type { Point3 } from '../types';

/**
 * Returns a function that takes an ijk position and efficiently returns
 * the world position.  Only works for integer ijk, AND values within the bounds.
 * The position array is re-used, so don't preserve it/compare for different
 * values, although you can provide an instance position to copy into.
 *
 * This function is safe to use out of order, and is stable in terms of calculations.
 */
export function createPositionCallback(imageData) {
  const currentPos = vec3.create();
  const dimensions = imageData.getDimensions();
  const positionI = PointsManager.create3(dimensions[0]);
  const positionJ = PointsManager.create3(dimensions[1]);
  const positionK = PointsManager.create3(dimensions[2]);

  const direction = imageData.getDirection();
  const rowCosines = direction.slice(0, 3);
  const columnCosines = direction.slice(3, 6);
  const scanAxisNormal = direction.slice(6, 9);

  const spacing = imageData.getSpacing();
  const [rowSpacing, columnSpacing, scanAxisSpacing] = spacing;

  const worldPosStart = imageData.indexToWorld([0, 0, 0]);

  const rowStep = vec3.fromValues(
    rowCosines[0] * rowSpacing,
    rowCosines[1] * rowSpacing,
    rowCosines[2] * rowSpacing
  );

  const columnStep = vec3.fromValues(
    columnCosines[0] * columnSpacing,
    columnCosines[1] * columnSpacing,
    columnCosines[2] * columnSpacing
  );

  const scanAxisStep = vec3.fromValues(
    scanAxisNormal[0] * scanAxisSpacing,
    scanAxisNormal[1] * scanAxisSpacing,
    scanAxisNormal[2] * scanAxisSpacing
  );

  const scaled = vec3.create();
  // Add the world position start to the I component so we don't need to add it
  for (let i = 0; i < dimensions[0]; i++) {
    positionI.push(
      vec3.add(scaled, worldPosStart, vec3.scale(scaled, rowStep, i)) as Point3
    );
  }
  for (let j = 0; j < dimensions[0]; j++) {
    positionJ.push(vec3.scale(scaled, columnStep, j) as Point3);
  }
  for (let k = 0; k < dimensions[0]; k++) {
    positionK.push(vec3.scale(scaled, scanAxisStep, k) as Point3);
  }

  const dataI = positionI.getTypedArray();
  const dataJ = positionJ.getTypedArray();
  const dataK = positionK.getTypedArray();

  return (ijk, destPoint = currentPos) => {
    const [i, j, k] = ijk;
    const offsetI = i * 3;
    const offsetJ = j * 3;
    const offsetK = k * 3;
    destPoint[0] = dataI[offsetI] + dataJ[offsetJ] + dataK[offsetK];
    destPoint[1] = dataI[offsetI + 1] + dataJ[offsetJ + 1] + dataK[offsetK + 1];
    destPoint[2] = dataI[offsetI + 2] + dataJ[offsetJ + 2] + dataK[offsetK + 2];
    return destPoint as Point3;
  };
}
