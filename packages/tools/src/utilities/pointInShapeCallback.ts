import { vec3 } from 'gl-matrix';
import type { Types } from '@cornerstonejs/core';
import type { vtkImageData } from '@kitware/vtk.js/Common/DataModel/ImageData';
import BoundsIJK from '../types/BoundsIJK';

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

export type ShapeFnCriteria = (
  pointIJK: Types.Point3,
  pointLPS: Types.Point3
) => boolean;

/**
 * For each point in the image (If boundsIJK is not provided, otherwise, for each
 * point in the provided bounding box), It runs the provided callback IF the point
 * passes the provided criteria to be inside the shape (which is defined by the
 * provided pointInShapeFn)
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
): void {
  let iMin, iMax, jMin, jMax, kMin, kMax;

  let scalarData;

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

  const start = vec3.fromValues(iMin, jMin, kMin);

  const direction = imageData.getDirection();
  const rowCosines = direction.slice(0, 3);
  const columnCosines = direction.slice(3, 6);
  const scanAxisNormal = direction.slice(6, 9);

  const spacing = imageData.getSpacing();
  const [rowSpacing, columnSpacing, scanAxisSpacing] = spacing;

  // @ts-ignore will be fixed in vtk-master
  const worldPosStart = imageData.indexToWorld(start);

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

  const yMultiple = dimensions[0];
  const zMultiple = dimensions[0] * dimensions[1];

  for (let k = kMin; k <= kMax; k++) {
    for (let j = jMin; j <= jMax; j++) {
      for (let i = iMin; i <= iMax; i++) {
        const pointIJK: Types.Point3 = [i, j, k];
        const dI = i - iMin;
        const dJ = j - jMin;
        const dK = k - kMin;

        const startWorld = worldPosStart;

        const pointLPS: Types.Point3 = [
          startWorld[0] +
            dI * rowStep[0] +
            dJ * columnStep[0] +
            dK * scanAxisStep[0],
          startWorld[1] +
            dI * rowStep[1] +
            dJ * columnStep[1] +
            dK * scanAxisStep[1],
          startWorld[2] +
            dI * rowStep[2] +
            dJ * columnStep[2] +
            dK * scanAxisStep[2],
        ];

        if (pointInShapeFn(pointLPS, pointIJK)) {
          const index = k * zMultiple + j * yMultiple + i;
          const value = scalarData[index];

          callback({ value, index, pointIJK, pointLPS });
        }
      }
    }
  }
}
