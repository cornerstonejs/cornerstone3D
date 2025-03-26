import * as metaData from '../metaData';
import isEqual from './isEqual';

/**
 * Checks if the given imageIds form a valid volume. A volume is considered valid if all imageIds
 * have the same series instance UID, modality, columns, rows, image orientation patient, and pixel
 * spacing.
 *
 * @param imageIds - The imageIds to check.
 * @returns true if the imageIds form a valid volume, false otherwise.
 */
function isValidVolume(imageIds: string[]): boolean {
  if (imageIds.length <= 1) {
    return false;
  }

  const imageId0 = imageIds[0];

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

  for (let i = 0; i < imageIds.length; i++) {
    const imageId = imageIds[i];
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

  return validVolume;
}

export { isValidVolume };
