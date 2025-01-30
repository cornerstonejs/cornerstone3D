import type { vec3 } from 'gl-matrix';
import type { vtkImageData } from '@kitware/vtk.js/Common/DataModel/ImageData';
import type BoundsIJK from '../types/BoundsIJK';
import type { CPUImageData, Point3 } from '../types';
import { createPositionCallback } from './createPositionCallback';

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
export function pointInShapeCallback(
  imageData: vtkImageData | CPUImageData,
  options: PointInShapeOptions
): Array<PointInShape> | undefined {
  const { pointInShapeFn, callback, boundsIJK, returnPoints = false } = options;

  let scalarData;

  // if getScalarData is a method on imageData
  if ((imageData as CPUImageData).getScalarData) {
    scalarData = (imageData as CPUImageData).getScalarData();
  } else {
    scalarData = (imageData as vtkImageData)
      .getPointData()
      .getScalars()
      .getData();
  }

  const dimensions = imageData.getDimensions();

  const defaultBoundsIJK = [
    [0, dimensions[0]],
    [0, dimensions[1]],
    [0, dimensions[2]],
  ];
  const bounds = boundsIJK || defaultBoundsIJK;

  const pointsInShape = iterateOverPointsInShape({
    imageData,
    bounds,
    scalarData,
    pointInShapeFn,
    callback,
  });

  return returnPoints ? pointsInShape : undefined;
}

export function iterateOverPointsInShape({
  imageData,
  bounds,
  scalarData,
  pointInShapeFn,
  callback,
}) {
  const [[iMin, iMax], [jMin, jMax], [kMin, kMax]] = bounds;
  const { numComps } = imageData as { numComps: number };
  const dimensions = imageData.getDimensions();

  const indexToWorld = createPositionCallback(imageData);
  const pointIJK = [0, 0, 0] as Point3;

  const xMultiple =
    numComps ||
    scalarData.length / dimensions[2] / dimensions[1] / dimensions[0];
  const yMultiple = dimensions[0] * xMultiple;
  const zMultiple = dimensions[1] * yMultiple;
  const pointsInShape: Array<PointInShape> = [];

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

          pointsInShape.push({
            value,
            index,
            pointIJK,
            pointLPS: pointLPS.slice(),
          });

          callback({ value, index, pointIJK, pointLPS });
        }
      }
    }
  }

  return pointsInShape;
}

export function iterateOverPointsInShapeVoxelManager({
  voxelManager,
  bounds,
  imageData,
  pointInShapeFn,
  callback,
  returnPoints,
}) {
  const [[iMin, iMax], [jMin, jMax], [kMin, kMax]] = bounds;
  const indexToWorld = createPositionCallback(imageData);
  const pointIJK = [0, 0, 0] as Point3;
  const pointsInShape: Array<PointInShape> = [];

  for (let k = kMin; k <= kMax; k++) {
    pointIJK[2] = k;

    for (let j = jMin; j <= jMax; j++) {
      pointIJK[1] = j;

      for (let i = iMin; i <= iMax; i++) {
        pointIJK[0] = i;
        const pointLPS = indexToWorld(pointIJK);

        if (pointInShapeFn(pointLPS, pointIJK)) {
          const index = voxelManager.toIndex(pointIJK);
          const value = voxelManager.getAtIndex(index);

          if (returnPoints) {
            pointsInShape.push({
              value,
              index,
              pointIJK: [...pointIJK],
              pointLPS: pointLPS.slice(),
            });
          }

          callback?.({ value, index, pointIJK, pointLPS });
        }
      }
    }
  }

  return pointsInShape;
}
