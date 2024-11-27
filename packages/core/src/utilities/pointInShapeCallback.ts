import { vec3 } from 'gl-matrix';
import type { vtkImageData } from '@kitware/vtk.js/Common/DataModel/ImageData';
import type BoundsIJK from '../types/BoundsIJK';
import type { CPUImageData, Point3 } from '../types';

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
  pointIJK: Point3;
  pointLPS: Point3;
}) => void;

export type ShapeFnCriteria = (pointLPS: vec3, pointIJK: vec3) => boolean;

/**
 * Options for the pointInShapeCallback function.
 */
export interface PointInShapeOptions {
  /** Function to determine if a point is inside the shape */
  pointInShapeFn: ShapeFnCriteria;
  /** Callback function for each point in the shape */
  callback?: PointInShapeCallback;
  /** Bounds of the volume in IJK coordinates */
  boundsIJK?: BoundsIJK;
  /** Whether to return the set of points in the shape */
  returnPoints?: boolean;
  // Add other options here for future optimizations
  // For example:
  // orthogonalVector?: vec3;
  // basisPoints?: { min: Point3, max: Point3 };
  // minMaxGenerator?: (row: number) => { min: number, max: number };
}

/**
 * @deprecated
 * You should use the voxelManager.forEach method instead.
 * This method is deprecated and will be removed in a future version.
 *
 * For each point in the image (If boundsIJK is not provided, otherwise, for each
 * point in the provided bounding box), It runs the provided callback IF the point
 * passes the provided criteria to be inside the shape (which is defined by the
 * provided pointInShapeFn)
 *
 * @param imageData - The image data object.
 * @param options - Configuration options for the shape callback.
 * @returns An array of points in the shape if returnPoints is true, otherwise undefined.
 */
export function pointInShapeCallback(
  imageData: vtkImageData | CPUImageData,
  options: PointInShapeOptions
): Array<PointInShape> | undefined {
  const {
    pointInShapeFn,
    callback,
    boundsIJK,
    returnPoints = false,
    // Destructure other options here as needed
  } = options;

  let iMin, iMax, jMin, jMax, kMin, kMax;

  let scalarData;
  const { numComps } = imageData as unknown as { numComps: number };

  // if getScalarData is a method on imageData
  if ((imageData as CPUImageData).getScalarData) {
    scalarData = (imageData as CPUImageData).getScalarData();
  } else {
    scalarData = (imageData as vtkImageData)
      .getPointData()
      .getScalars()
      .getData();
  }

  if (!scalarData) {
    console.warn('No scalar data found for imageData', imageData);
    return;
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

  const xMultiple =
    numComps ||
    scalarData.length / dimensions[2] / dimensions[1] / dimensions[0];
  const yMultiple = dimensions[0] * xMultiple;
  const zMultiple = dimensions[1] * yMultiple;

  const pointsInShape: Array<PointInShape> = [];

  const currentPos = vec3.clone(worldPosStart);

  for (let k = kMin; k <= kMax; k++) {
    const startPosJ = vec3.clone(currentPos);

    for (let j = jMin; j <= jMax; j++) {
      const startPosI = vec3.clone(currentPos);

      for (let i = iMin; i <= iMax; i++) {
        const pointIJK: Point3 = [i, j, k];

        // The current world position (pointLPS) is now in currentPos
        if (pointInShapeFn(currentPos as Point3, pointIJK)) {
          const index = k * zMultiple + j * yMultiple + i * xMultiple;
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

          pointsInShape.push({
            value,
            index,
            pointIJK,
            pointLPS: currentPos.slice(),
          });
          if (callback) {
            callback({
              value,
              index,
              pointIJK,
              pointLPS: currentPos as Point3,
            });
          }
        }

        // Increment currentPos by rowStep for the next iteration
        vec3.add(currentPos, currentPos, rowStep);
      }

      // Reset currentPos to the start of the next J line and increment by columnStep
      vec3.copy(currentPos, startPosI);
      vec3.add(currentPos, currentPos, columnStep);
    }

    // Reset currentPos to the start of the next K slice and increment by scanAxisStep
    vec3.copy(currentPos, startPosJ);
    vec3.add(currentPos, currentPos, scanAxisStep);
  }

  // Modify the return statement
  return returnPoints ? pointsInShape : undefined;
}
