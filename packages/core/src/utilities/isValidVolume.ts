import * as metaData from '../metaData';
import isEqual from './isEqual';

/**
 * Checks if the given imageIds form valid volume(s). Accepts a single array of imageIds (for single or multi-volume segmentations).
 * For multi-volume, use numberOfImages to split the flat array into groups and check each group independently.
 * A volume is considered valid if all imageIds in the group have the same series instance UID, modality, columns,
 * rows, image orientation patient, and pixel spacing.
 *
 * @param imageIds - The imageIds to check (flat string[] for single or multi-volume).
 * @param numberOfImages - Number of images per volume (required for multi-volume).
 * @returns true if all imageId groups form valid volumes, false otherwise.
 */
function isValidVolume(imageIds: string[], numberOfImages?: number): boolean {
  if (!imageIds || imageIds.length === 0) {
    return false;
  }
  let groups: string[][] = [imageIds];
  if (numberOfImages && imageIds.length > numberOfImages) {
    const numVolumes = Math.floor(imageIds.length / numberOfImages);
    groups = [];
    for (let i = 0; i < numVolumes; i++) {
      groups.push(imageIds.slice(i * numberOfImages, (i + 1) * numberOfImages));
    }
  }
  for (const idsToCheck of groups) {
    if (!idsToCheck || idsToCheck.length <= 1) {
      return false;
    }
    const imageId0 = idsToCheck[0];
    const { modality, seriesInstanceUID } = metaData.get(
      'generalSeriesModule',
      imageId0
    );
    const {
      imageOrientationPatient,
      pixelSpacing,
      frameOfReferenceUID,
      columns,
      rows,
      usingDefaultValues,
    } = metaData.get('imagePlaneModule', imageId0);
    if (usingDefaultValues) {
      return false;
    }
    const baseMetadata = {
      modality,
      imageOrientationPatient,
      pixelSpacing,
      frameOfReferenceUID,
      columns,
      rows,
      seriesInstanceUID,
    };
    let validVolume = true;
    for (let i = 0; i < idsToCheck.length; i++) {
      const imageId = idsToCheck[i];
      const { modality, seriesInstanceUID } = metaData.get(
        'generalSeriesModule',
        imageId
      );
      const { imageOrientationPatient, pixelSpacing, columns, rows } =
        metaData.get('imagePlaneModule', imageId);
      if (seriesInstanceUID !== baseMetadata.seriesInstanceUID) {
        validVolume = false;
        break;
      }
      if (modality !== baseMetadata.modality) {
        validVolume = false;
        break;
      }
      if (columns !== baseMetadata.columns) {
        validVolume = false;
        break;
      }
      if (rows !== baseMetadata.rows) {
        validVolume = false;
        break;
      }
      if (
        !isEqual(imageOrientationPatient, baseMetadata.imageOrientationPatient)
      ) {
        validVolume = false;
        break;
      }
      if (!isEqual(pixelSpacing, baseMetadata.pixelSpacing)) {
        validVolume = false;
        break;
      }
    }
    if (!validVolume) {
      return false;
    }
  }
  return true;
}

export { isValidVolume };
