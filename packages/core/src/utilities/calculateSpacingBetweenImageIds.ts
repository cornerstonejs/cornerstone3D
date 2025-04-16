import { vec3 } from 'gl-matrix';
import * as metaData from '../metaData';
import { getConfiguration } from '../init';

/**
 * Calculates the spacing between images in a series based on their positions
 *
 * @param imageIds - array of imageIds
 * @returns The calculated spacing value between images
 */
export default function calculateSpacingBetweenImageIds(
  imageIds: string[]
): number {
  const {
    imagePositionPatient: referenceImagePositionPatient,
    imageOrientationPatient,
  } = metaData.get('imagePlaneModule', imageIds[0]);

  // Calculate scan axis normal from image orientation
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

  const scanAxisNormal = vec3.create();
  vec3.cross(scanAxisNormal, rowCosineVec, colCosineVec);

  // Convert referenceImagePositionPatient to vec3
  const refIppVec = vec3.fromValues(
    referenceImagePositionPatient[0],
    referenceImagePositionPatient[1],
    referenceImagePositionPatient[2]
  );

  // Check if we are using wadouri scheme
  const usingWadoUri = imageIds[0].split(':')[0] === 'wadouri';
  let spacing: number;

  function getDistance(imageId: string) {
    const { imagePositionPatient } = metaData.get('imagePlaneModule', imageId);
    const positionVector = vec3.create();

    // Convert imagePositionPatient to vec3
    const ippVec = vec3.fromValues(
      imagePositionPatient[0],
      imagePositionPatient[1],
      imagePositionPatient[2]
    );

    vec3.sub(positionVector, refIppVec, ippVec);
    return vec3.dot(positionVector, scanAxisNormal);
  }

  if (!usingWadoUri) {
    const distanceImagePairs = imageIds.map((imageId) => {
      const distance = getDistance(imageId);
      return {
        distance,
        imageId,
      };
    });

    distanceImagePairs.sort((a, b) => b.distance - a.distance);
    const numImages = distanceImagePairs.length;

    // Calculated average spacing.
    // We would need to resample if these are not similar.
    // It should be up to the host app to do this if it needed to.
    spacing =
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

    const firstImageDistance = getDistance(prefetchedImageIds[0]);
    const middleImageDistance = getDistance(prefetchedImageIds[1]);

    const metadataForMiddleImage = metaData.get(
      'imagePlaneModule',
      prefetchedImageIds[1]
    );

    if (!metadataForMiddleImage) {
      throw new Error('Incomplete metadata required for volume construction.');
    }

    const positionVector = vec3.create();

    // Convert metadataForMiddleImage.imagePositionPatient to vec3
    const middleIppVec = vec3.fromValues(
      metadataForMiddleImage.imagePositionPatient[0],
      metadataForMiddleImage.imagePositionPatient[1],
      metadataForMiddleImage.imagePositionPatient[2]
    );

    vec3.sub(positionVector, refIppVec, middleIppVec);
    const distanceBetweenFirstAndMiddleImages = vec3.dot(
      positionVector,
      scanAxisNormal
    );
    spacing =
      Math.abs(distanceBetweenFirstAndMiddleImages) /
      Math.floor(imageIds.length / 2);
  }

  const { sliceThickness, spacingBetweenSlices } = metaData.get(
    'imagePlaneModule',
    imageIds[0]
  );

  const { strictZSpacingForVolumeViewport } = getConfiguration().rendering;

  // We implemented these lines for multiframe dicom files that does not have
  // position for each frame, leading to incorrect calculation of spacing = 0
  // If possible, we use the sliceThickness, but we warn about this dicom file
  // weirdness. If sliceThickness is not available, we set to 1 just to render
  if ((spacing === 0 || isNaN(spacing)) && !strictZSpacingForVolumeViewport) {
    if (spacingBetweenSlices) {
      console.debug('Could not calculate spacing. Using spacingBetweenSlices');
      spacing = spacingBetweenSlices;
    } else if (sliceThickness) {
      console.debug(
        'Could not calculate spacing and no spacingBetweenSlices. Using sliceThickness'
      );
      spacing = sliceThickness;
    } else {
      console.debug(
        'Could not calculate spacing. The VolumeViewport visualization is compromised. Setting spacing to 1 to render'
      );
      spacing = 1;
    }
  }

  return spacing;
}
