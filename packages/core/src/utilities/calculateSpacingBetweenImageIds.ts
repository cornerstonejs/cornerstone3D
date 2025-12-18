import { vec3 } from 'gl-matrix';
import * as metaData from '../metaData';
import { getConfiguration } from '../init';

/**
 * Default spacing value (in mm) used as fallback when spacing cannot be calculated
 * or retrieved from DICOM metadata
 */
const DEFAULT_THICKNESS_SINGLE_SLICE = 1;

/**
 * Gets pixel spacing value for creating cubic voxels with equal side lengths.
 *
 * @param metadata - Image plane module metadata
 * @returns The best available pixel spacing value, or undefined if none available
 */
function getPixelSpacingForCubicVoxel(metadata: {
  columnPixelSpacing?: number;
  rowPixelSpacing?: number;
  pixelSpacing?: number[];
}): number | undefined {
  if (metadata.columnPixelSpacing !== undefined) {
    return metadata.columnPixelSpacing;
  }
  if (metadata.rowPixelSpacing !== undefined) {
    return metadata.rowPixelSpacing;
  }
  if (metadata.pixelSpacing?.[1] !== undefined) {
    return metadata.pixelSpacing[1];
  }
  if (metadata.pixelSpacing?.[0] !== undefined) {
    return metadata.pixelSpacing[0];
  }
  return undefined;
}

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

  if (imageIds.length === 1) {
    const {
      sliceThickness,
      spacingBetweenSlices,
      columnPixelSpacing,
      rowPixelSpacing,
      pixelSpacing,
    } = metaData.get('imagePlaneModule', imageIds[0]);

    if (sliceThickness) return sliceThickness;
    if (spacingBetweenSlices) return spacingBetweenSlices;

    const pixelSpacingValue = getPixelSpacingForCubicVoxel({
      columnPixelSpacing,
      rowPixelSpacing,
      pixelSpacing,
    });
    if (pixelSpacingValue !== undefined) {
      return pixelSpacingValue;
    }

    return DEFAULT_THICKNESS_SINGLE_SLICE;
  }

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

  const {
    sliceThickness,
    spacingBetweenSlices,
    columnPixelSpacing,
    rowPixelSpacing,
    pixelSpacing,
  } = metaData.get('imagePlaneModule', imageIds[0]);

  const { strictZSpacingForVolumeViewport } = getConfiguration().rendering;

  // We implemented these lines for multiframe dicom files that does not have
  // position for each frame, leading to incorrect calculation of spacing = 0
  // If possible, we use the sliceThickness, but we warn about this dicom file
  // weirdness. If sliceThickness is not available, we use pixel spacing for
  // cubic voxel creation
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
      const pixelSpacingValue = getPixelSpacingForCubicVoxel({
        columnPixelSpacing,
        rowPixelSpacing,
        pixelSpacing,
      });
      if (pixelSpacingValue) {
        spacing = pixelSpacingValue;
      } else {
        console.debug(
          `Could not calculate spacing and no pixel spacing found. Using default thickness (${DEFAULT_THICKNESS_SINGLE_SLICE} mm)`
        );
        spacing = DEFAULT_THICKNESS_SINGLE_SLICE;
      }
    }
  }

  return spacing;
}
