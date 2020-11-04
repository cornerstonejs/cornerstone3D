import { vec3 } from 'gl-matrix';

/**
 *
 * @param {*} scanAxisNormal - [x, y, z] array or gl-matrix vec3
 * @param {*} imageMetaDataMap - one of the results from BuildMetadata()
 */
export default function sortDatasetsByImagePosition(imageIds, scanAxisNormal) {
  const {
    imagePositionPatient: referenceImagePositionPatient,
  } = cornerstone.metaData.get('imagePlaneModule', imageIds[0]);

  const refIppVec = vec3.create();

  vec3.set(refIppVec, ...referenceImagePositionPatient);

  const distanceImagePairs = imageIds.map(imageId => {
    const { imagePositionPatient } = cornerstone.metaData.get(
      'imagePlaneModule',
      imageId
    );

    // const ippVec = new Vector3(...imagePositionPatient);
    // const positionVector = refIppVec.clone().sub(ippVec);

    const positionVector = vec3.sub(
      [],
      referenceImagePositionPatient,
      imagePositionPatient
    );

    const distance = vec3.dot(positionVector, scanAxisNormal);

    return {
      distance,
      imageId,
    };
  });

  distanceImagePairs.sort((a, b) => b.distance - a.distance);

  const sortedImageIds = distanceImagePairs.map(a => a.imageId);
  const numImages = distanceImagePairs.length;

  // Calculated average spacing.
  // We would need to resample if these are not similar.
  // It should be up to the host app to do this if it needed to.
  const zSpacing =
    Math.abs(
      distanceImagePairs[numImages - 1].distance -
        distanceImagePairs[0].distance
    ) /
    (numImages - 1);

  const { imagePositionPatient: origin } = cornerstone.metaData.get(
    'imagePlaneModule',
    sortedImageIds[0]
  );

  return {
    zSpacing,
    origin,
    sortedImageIds,
  };
}
