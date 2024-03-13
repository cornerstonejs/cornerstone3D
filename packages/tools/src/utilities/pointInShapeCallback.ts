import { vec3 } from 'gl-matrix';
import { Types, utilities } from '@cornerstonejs/core';
import type { vtkImageData } from '@kitware/vtk.js/Common/DataModel/ImageData';
import BoundsIJK from '../types/BoundsIJK';

const { PointsManager } = utilities;

export type PointInShape = {
  value: number;
  index: number;
  pointIJK: vec3;
  pointLPS: vec3 | number[];
};

export type PointInShapeCallback = ({
  value,
  index,
  pointIJK,
  pointLPS,
}: {
  value: number;
  index: number;
  pointIJK: Types.Point3;
  pointLPS: Types.Point3;
}) => void;

export type ShapeFnCriteria = (pointLPS: vec3, pointIJK: vec3) => boolean;

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

  // @ts-ignore will be fixed in vtk-master
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
      vec3.add(
        scaled,
        worldPosStart,
        vec3.scale(scaled, rowStep, i)
      ) as Types.Point3
    );
  }
  for (let j = 0; j < dimensions[0]; j++) {
    positionJ.push(vec3.scale(scaled, columnStep, j) as Types.Point3);
  }
  for (let k = 0; k < dimensions[0]; k++) {
    positionK.push(vec3.scale(scaled, scanAxisStep, k) as Types.Point3);
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
    return destPoint as Types.Point3;
  };
}

/**
 * For each point in the image (If boundsIJK is not provided, otherwise, for each
 * point in the provided bounding box), It runs the provided callback IF the point
 * passes the provided criteria to be inside the shape (which is defined by the
 * provided pointInShapeFn)
 *
 * You must record points in the callback function if you wish to have an array
 * of the called points.
 *
 * @param imageData - The image data object.
 * @param dimensions - The dimensions of the image.
 * @param pointInShapeFn - A function that takes a point in LPS space and returns
 * true if the point is in the shape and false if it is not.
 * @param callback - A function that will be called for
 * every point in the shape.
 * @param boundsIJK - The bounds of the volume in IJK coordinates.
 */
export default function pointInShapeCallback(
  imageData: vtkImageData | Types.CPUImageData,
  pointInShapeFn: ShapeFnCriteria,
  callback: PointInShapeCallback,
  boundsIJK?: BoundsIJK
) {
  let iMin, iMax, jMin, jMax, kMin, kMax;

  let scalarData;
  const { numComps } = imageData as any;

  // if getScalarData is a method on imageData
  if ((imageData as Types.CPUImageData).getScalarData) {
    scalarData = (imageData as Types.CPUImageData).getScalarData();
  } else {
    scalarData = (imageData as vtkImageData)
      .getPointData()
      .getScalars()
      .getData();
  }

  const dimensions = imageData.getDimensions();

  if (!boundsIJK) {
    iMin = 0;
    iMax = dimensions[0];
    jMin = 0;
    jMax = dimensions[1];
    kMin = 0;
    kMax = dimensions[2];
  } else {
    [[iMin, iMax], [jMin, jMax], [kMin, kMax]] = boundsIJK;
  }

  const indexToWorld = createPositionCallback(imageData);
  const pointIJK = [0, 0, 0] as Types.Point3;

  const xMultiple =
    numComps ||
    scalarData.length / dimensions[2] / dimensions[1] / dimensions[0];
  const yMultiple = dimensions[0] * xMultiple;
  const zMultiple = dimensions[1] * yMultiple;

  for (let k = kMin; k <= kMax; k++) {
    pointIJK[2] = k;
    const indexK = k * zMultiple;

    for (let j = jMin; j <= jMax; j++) {
      pointIJK[1] = j;
      const indexJK = indexK + j * yMultiple;

      for (let i = iMin; i <= iMax; i++) {
        pointIJK[0] = i;
        const pointLPS = indexToWorld(pointIJK);

        // The current world position (pointLPS) is now in currentPos
        if (pointInShapeFn(pointLPS, pointIJK)) {
          const index = indexJK + i * xMultiple;
          let value;
          if (xMultiple > 2) {
            value = [
              scalarData[index],
              scalarData[index + 1],
              scalarData[index + 2],
            ];
          } else {
            value = scalarData[index];
          }

          callback({ value, index, pointIJK, pointLPS });
        }
      }
    }
  }
}
