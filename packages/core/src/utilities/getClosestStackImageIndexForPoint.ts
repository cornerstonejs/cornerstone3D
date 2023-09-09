import { vec3 } from 'gl-matrix';
import { planar } from '.';
import { metaData } from '..';
import { IStackViewport, Point3 } from '../types';

/**
 * Given a point in 3D space and a viewport it returns the index of the closest imageId, it assumes that stack images are sorted according to their sliceLocation
 * @param point - [A, B, C] coordinates of the point in 3D space
 * @param viewport - The StackViewport to search for the closest imageId
 *
 * @returns The imageId index of the closest imageId or null if no imageId is found
 */
export default function getClosestStackImageIndexForPoint(
  point: Point3,
  viewport: IStackViewport
): number | null {
  const minimalDistance = calculateMinimalDistanceForStackViewport(
    point,
    viewport
  );
  return minimalDistance ? minimalDistance.index : null;
}

//assumes that imageIds are sorted by slice location
export function calculateMinimalDistanceForStackViewport(
  point: Point3,
  viewport: IStackViewport
): { distance: number; index: number } | null {
  const imageIds = viewport.getImageIds();
  const currentImageIdIndex = viewport.getCurrentImageIdIndex();

  if (imageIds.length === 0) {
    return null;
  }

  const getDistance = (imageId: string): null | number => {
    const planeMetadata = getPlaneMetadata(imageId);
    if (!planeMetadata) {
      return null;
    }
    const plane = planar.planeEquation(
      planeMetadata.planeNormal,
      planeMetadata.imagePositionPatient
    );
    const distance = planar.planeDistanceToPoint(plane, point);
    return distance;
  };

  const closestStack = {
    distance: getDistance(imageIds[currentImageIdIndex]) ?? Infinity,
    index: currentImageIdIndex,
  };

  //check higher indices
  const higherImageIds = imageIds.slice(currentImageIdIndex + 1);

  for (let i = 0; i < higherImageIds.length; i++) {
    const id = higherImageIds[i];
    const distance = getDistance(id);
    if (distance === null) {
      continue;
    }
    if (distance <= closestStack.distance) {
      closestStack.distance = distance;
      closestStack.index = i + currentImageIdIndex + 1;
    } else {
      break;
    }
  }
  //check lower indices
  const lowerImageIds = imageIds.slice(0, currentImageIdIndex);
  for (let i = lowerImageIds.length - 1; i >= 0; i--) {
    const id = lowerImageIds[i];
    const distance = getDistance(id);
    if (distance === null || distance === closestStack.distance) {
      continue;
    }
    if (distance < closestStack.distance) {
      closestStack.distance = distance;
      closestStack.index = i;
    } else {
      break;
    }
  }
  return closestStack.distance === Infinity ? null : closestStack;
}

function getPlaneMetadata(imageId: string): null | {
  rowCosines: Point3;
  columnCosines: Point3;
  imagePositionPatient: Point3;
  planeNormal: Point3;
} {
  const targetImagePlane = metaData.get('imagePlaneModule', imageId);

  if (
    !targetImagePlane ||
    !(
      targetImagePlane.rowCosines instanceof Array &&
      targetImagePlane.rowCosines.length === 3
    ) ||
    !(
      targetImagePlane.columnCosines instanceof Array &&
      targetImagePlane.columnCosines.length === 3
    ) ||
    !(
      targetImagePlane.imagePositionPatient instanceof Array &&
      targetImagePlane.imagePositionPatient.length === 3
    )
  ) {
    return null;
  }
  const {
    rowCosines,
    columnCosines,
    imagePositionPatient,
  }: {
    rowCosines: Point3;
    columnCosines: Point3;
    imagePositionPatient: Point3;
  } = targetImagePlane;

  const rowVec = vec3.set(vec3.create(), ...rowCosines);
  const colVec = vec3.set(vec3.create(), ...columnCosines);
  const planeNormal = vec3.cross(vec3.create(), rowVec, colVec) as Point3;

  return { rowCosines, columnCosines, imagePositionPatient, planeNormal };
}
