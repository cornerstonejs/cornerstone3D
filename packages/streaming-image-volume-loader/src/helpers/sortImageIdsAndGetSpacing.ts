import { vec3 } from 'gl-matrix';
import { metaData } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

type SortedImageIdsItem = {
  zSpacing: number;
  origin: Types.Point3;
  sortedImageIds: Array<string>;
};
/**
 * Given an array of imageIds, sort them based on their imagePositionPatient, and
 * also returns the spacing between images and the origin of the reference image
 *
 * @param imageIds - array of imageIds
 * @param scanAxisNormal - [x, y, z] array or gl-matrix vec3
 *
 * @returns The sortedImageIds, zSpacing, and origin of the first image in the series.
 */
export default function sortImageIdsAndGetSpacing(
  imageIds: Array<string>,
  scanAxisNormal: vec3 // Get gl matrix types?
): SortedImageIdsItem {
  const { imagePositionPatient: referenceImagePositionPatient } = metaData.get(
    'imagePlaneModule',
    imageIds[0]
  );

  const refIppVec = vec3.create();

  // Check if we are using wadouri scheme
  const usingWadoUri = imageIds[0].split(':')[0] === 'wadouri'

  vec3.set(
    refIppVec,
    referenceImagePositionPatient[0],
    referenceImagePositionPatient[1],
    referenceImagePositionPatient[2]
  );

  let sortedImageIds: string[];
  let zSpacing: number;

  function getDistance(imageId: string) {
    const { imagePositionPatient } = metaData.get('imagePlaneModule', imageId);

    const positionVector = vec3.create();

    vec3.sub(
      positionVector,
      referenceImagePositionPatient,
      imagePositionPatient
    );

    return vec3.dot(positionVector, scanAxisNormal);
  }

  /**
   * If we are using wadors and so have all image metadata cached ahead of time,
   * then sort by image position in 3D space, and calculate average slice
   * spacing from the entire volume. If not, then use the sampled images (1st
   * and middle) to calculate slice spacing, and use the provided imageId order.
   * Correct sorting must be done ahead of time.
   */
  if (!usingWadoUri) {
    const distanceImagePairs = imageIds.map((imageId) => {
      const distance = getDistance(imageId);

      return {
        distance,
        imageId,
      };
    });

    distanceImagePairs.sort((a, b) => b.distance - a.distance);

    sortedImageIds = distanceImagePairs.map((a) => a.imageId);
    const numImages = distanceImagePairs.length;

    // Calculated average spacing.
    // We would need to resample if these are not similar.
    // It should be up to the host app to do this if it needed to.
    zSpacing =
      Math.abs(
        distanceImagePairs[numImages - 1].distance -
          distanceImagePairs[0].distance
      ) /
      (numImages - 1);
  } else {
    // Using wadouri, so we have only prefetched the first, middle, and last
    // images for metadata. Assume initial imageId array order is pre-sorted,
    // but check orientation.
    const prefetchedImageIds = [
      imageIds[0],
      imageIds[Math.floor(imageIds.length / 2)],
    ];
    sortedImageIds = imageIds;
    const firstImageDistance = getDistance(prefetchedImageIds[0]);
    const middleImageDistance = getDistance(prefetchedImageIds[1]);
    if (firstImageDistance - middleImageDistance < 0) {
      sortedImageIds.reverse();
    }

    // Calculate average spacing between the first and middle prefetched images,
    // otherwise fall back to DICOM `spacingBetweenSlices`
    const metadataForMiddleImage = metaData.get(
      'imagePlaneModule',
      prefetchedImageIds[1]
    );
    if (!metadataForMiddleImage) {
      throw new Error('Incomplete metadata required for volume construction.');
    }

    const positionVector = vec3.create();

    vec3.sub(
      positionVector,
      referenceImagePositionPatient,
      metadataForMiddleImage.imagePositionPatient
    );
    const distanceBetweenFirstAndMiddleImages = vec3.dot(
      positionVector,
      scanAxisNormal
    );
    zSpacing =
      Math.abs(distanceBetweenFirstAndMiddleImages) /
      Math.floor(imageIds.length / 2);
  }

  const { imagePositionPatient: origin } = metaData.get(
    'imagePlaneModule',
    sortedImageIds[0]
  );

  const result: SortedImageIdsItem = {
    zSpacing,
    origin,
    sortedImageIds,
  };

  return result;
}
