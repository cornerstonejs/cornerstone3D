import { vec3 } from 'gl-matrix';
import * as metaData from '../metaData';
import calculateSpacingBetweenImageIds from './calculateSpacingBetweenImageIds';
import type { Point3 } from '../types';

interface SortedImageIdsItem {
  zSpacing: number;
  origin: Point3;
  sortedImageIds: string[];
}
/**
 * Given an array of imageIds, sort them based on their imagePositionPatient, and
 * also returns the spacing between images and the origin of the reference image
 *
 * @param imageIds - array of imageIds
 * @param scanAxisNormal - [x, y, z] array or gl-matrix vec3
 *
 * @returns The sortedImageIds, spacing, and origin of the first image in the series.
 */
export default function sortImageIdsAndGetSpacing(
  imageIds: string[],
  scanAxisNormal?: vec3
): SortedImageIdsItem {
  const {
    imagePositionPatient: referenceImagePositionPatient,
    imageOrientationPatient,
  } = metaData.get('imagePlaneModule', imageIds[0]);

  if (!scanAxisNormal) {
    const rowCosineVec = vec3.fromValues(
      imageOrientationPatient[0],
      imageOrientationPatient[1],
      imageOrientationPatient[2]
    );
    const colCosineVec = vec3.fromValues(
      imageOrientationPatient[3],
      imageOrientationPatient[4],
      imageOrientationPatient[5]
    );

    scanAxisNormal = vec3.create();
    vec3.cross(scanAxisNormal, rowCosineVec, colCosineVec);
  }

  // Check if we are using wadouri scheme
  const usingWadoUri = imageIds[0].split(':')[0] === 'wadouri';

  const zSpacing = calculateSpacingBetweenImageIds(imageIds);

  let sortedImageIds: string[];

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
