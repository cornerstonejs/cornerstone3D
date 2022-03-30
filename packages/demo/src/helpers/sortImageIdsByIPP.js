import { metaData } from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';

/**
 * Sorts the given imageIds by image position based on image position patient
 * and image orientation patient. Sorts in ascending order.
 *
 * @param {string[]} imageIds imageIds
 * @returns {string[]} sorted imageIds
 */
export default function sortImageIdsByIPP(imageIds) {
  const {
    imagePositionPatient: referenceImagePositionPatient,
    imageOrientationPatient,
  } = metaData.get('imagePlaneModule', imageIds[0]);

  // If there is no imagePositionPatientInformation
  if (referenceImagePositionPatient === undefined) {
    return imageIds;
  }

  const refIppVec = vec3.fromValues(...referenceImagePositionPatient);

  let scanAxisNormal = vec3.create();

  const vector1 = vec3.fromValues(
    imageOrientationPatient[0],
    imageOrientationPatient[1],
    imageOrientationPatient[2]
  );

  const vector2 = vec3.fromValues(
    imageOrientationPatient[3],
    imageOrientationPatient[4],
    imageOrientationPatient[5]
  );

  vec3.cross(scanAxisNormal, vector1, vector2);

  let positionVector = vec3.create();
  let distance = vec3.create();

  const distanceImagePairs = imageIds.map((imageId) => {
    const { imagePositionPatient } = metaData.get('imagePlaneModule', imageId);

    const ippVec = vec3.fromValues(...imagePositionPatient);
    vec3.subtract(positionVector, refIppVec, ippVec);
    distance = vec3.dot(positionVector, scanAxisNormal);

    return {
      distance,
      imageId,
    };
  });

  distanceImagePairs.sort((a, b) => b.distance - a.distance);

  const sortedImageIds = distanceImagePairs.map((a) => a.imageId);

  return sortedImageIds;
}
