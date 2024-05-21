import { metaData, utilities } from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';

/**
 * Calculates the plane normal given the image orientation vector
 * @param imageOrientation
 * @returns
 */
export function calculatePlaneNormal(imageOrientation) {
  const rowCosineVec = vec3.fromValues(
    imageOrientation[0],
    imageOrientation[1],
    imageOrientation[2]
  );
  const colCosineVec = vec3.fromValues(
    imageOrientation[3],
    imageOrientation[4],
    imageOrientation[5]
  );
  return vec3.cross(vec3.create(), rowCosineVec, colCosineVec);
}

/**
 * Sort a imageId list
 * @param imageIds
 * @returns
 */
export function sortImageIds(imageIds) {
  const { imageOrientationPatient } = metaData.get(
    'imagePlaneModule',
    imageIds[0]
  );
  const scanAxisNormal = calculatePlaneNormal(imageOrientationPatient);
  const { sortedImageIds } = utilities.sortImageIdsAndGetSpacing(
    imageIds,
    scanAxisNormal
  );
  return sortedImageIds;
}
