import { metaData } from '@vtk-viewport';
import { Vector3 } from 'cornerstone-math';

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

  const refIppVec = new Vector3(...referenceImagePositionPatient);

  const scanAxisNormal = new Vector3(
    imageOrientationPatient[0],
    imageOrientationPatient[1],
    imageOrientationPatient[2]
  ).cross(
    new Vector3(
      imageOrientationPatient[3],
      imageOrientationPatient[4],
      imageOrientationPatient[5]
    )
  );

  const distanceImagePairs = imageIds.map(imageId => {
    const { imagePositionPatient } = cornerstone.metaData.get(
      'imagePlaneModule',
      imageId
    );

    const ippVec = new Vector3(...imagePositionPatient);
    const positionVector = refIppVec.clone().sub(ippVec);
    const distance = positionVector.dot(scanAxisNormal);

    return {
      distance,
      imageId,
    };
  });

  distanceImagePairs.sort((a, b) => b.distance - a.distance);

  const sortedImageIds = distanceImagePairs.map(a => a.imageId);

  return sortedImageIds;
}
