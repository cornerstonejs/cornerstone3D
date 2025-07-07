import * as metaData from '../metaData';
import { getNumberOfReferenceImageIds } from './getNumberOfReferenceImageIds';
import isEqual from './isEqual';

/**
 * Checks if the given imageIds form valid volume(s). Accepts a single array of imageIds (for single or multi-volume segmentations).
 *
 * The function determines the number of images per volume by creating a set of reference image IDs for the given imageIds.
 * For each imageId, it uses cache.getImage(imageId).referencedImageId if available, otherwise falls back to the imageId itself.
 * If cache.getImage(imageId) returns undefined, that imageId is skipped.
 * The number of unique reference image IDs is used to split the input into groups (volumes), and each group is validated independently.
 *
 * A volume is considered valid if all imageIds in the group have the same series instance UID, modality, columns,
 * rows, image orientation patient, and pixel spacing.
 *
 * @param imageIds - The imageIds to check (flat string[] for single or multi-volume).
 * @returns true if all imageId groups form valid volumes, false otherwise.
 */
/**
 * Validates metadata for a single image and returns it if valid.
 * @param imageId - The image ID to validate
 * @returns The metadata object if valid, null if invalid
 */
function getValidatedMetadata(imageId: string) {
  try {
    const generalSeries = metaData.get('generalSeriesModule', imageId);
    const imagePlane = metaData.get('imagePlaneModule', imageId);

    if (!generalSeries || !imagePlane) {
      return null;
    }

    const { modality, seriesInstanceUID } = generalSeries;
    const {
      imageOrientationPatient,
      pixelSpacing,
      frameOfReferenceUID,
      columns,
      rows,
      usingDefaultValues,
    } = imagePlane;

    // Check for required properties and default values
    if (
      usingDefaultValues ||
      !modality ||
      !seriesInstanceUID ||
      !imageOrientationPatient ||
      !pixelSpacing ||
      columns == null ||
      rows == null
    ) {
      return null;
    }

    return {
      modality,
      seriesInstanceUID,
      imageOrientationPatient,
      pixelSpacing,
      frameOfReferenceUID,
      columns,
      rows,
    };
  } catch (error) {
    console.warn(`Failed to get metadata for imageId: ${imageId}`, error);
    return null;
  }
}

/**
 * Validates that all images in a group have consistent metadata.
 * @param idsToCheck - Array of image IDs to validate
 * @returns true if all images have consistent metadata, false otherwise
 */
function validateImageGroup(idsToCheck: string[]): boolean {
  if (!idsToCheck || idsToCheck.length <= 1) {
    return false;
  }

  // Get baseline metadata from first image
  const baseMetadata = getValidatedMetadata(idsToCheck[0]);
  if (!baseMetadata) {
    return false;
  }

  // Validate all other images against baseline
  for (let i = 1; i < idsToCheck.length; i++) {
    const currentMetadata = getValidatedMetadata(idsToCheck[i]);
    if (!currentMetadata) {
      return false;
    }

    // Check each property for consistency
    if (
      currentMetadata.seriesInstanceUID !== baseMetadata.seriesInstanceUID ||
      currentMetadata.modality !== baseMetadata.modality ||
      currentMetadata.columns !== baseMetadata.columns ||
      currentMetadata.rows !== baseMetadata.rows ||
      !isEqual(
        currentMetadata.imageOrientationPatient,
        baseMetadata.imageOrientationPatient
      ) ||
      !isEqual(currentMetadata.pixelSpacing, baseMetadata.pixelSpacing)
    ) {
      return false;
    }
  }

  return true;
}

function isValidVolume(imageIds: string[]): boolean {
  if (!imageIds || imageIds.length === 0) {
    return false;
  }
  let groups: string[][] = [imageIds];
  const numberOfImages = getNumberOfReferenceImageIds(imageIds);
  // If numberOfImages is defined, split the imageIds into groups of that size.
  if (numberOfImages && imageIds.length > numberOfImages) {
    const numVolumes = Math.floor(imageIds.length / numberOfImages);
    groups = [];
    for (let i = 0; i < numVolumes; i++) {
      groups.push(imageIds.slice(i * numberOfImages, (i + 1) * numberOfImages));
    }
  }

  // Validate each group
  for (const group of groups) {
    if (!validateImageGroup(group)) {
      return false;
    }
  }

  return true;
}

export { isValidVolume };
