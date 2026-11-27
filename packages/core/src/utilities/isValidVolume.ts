import { vec3 } from 'gl-matrix';
import * as metaData from '../metaData';
import { MetadataModules } from '../enums';
import isEqual from './isEqual';

/**
 * Checks if the given imageIds form a valid volume. A volume is considered valid if all imageIds
 * have the same series instance UID, modality, columns, rows, image orientation patient, and pixel
 * spacing, and if their positions lie on an evenly spaced grid along the scan axis.
 *
 * @param imageIds - The imageIds to check.
 * @returns true if the imageIds form a valid volume, false otherwise.
 */
function isValidVolume(imageIds: string[]): boolean {
  if (!imageIds.length) {
    return false;
  }

  const imageId0 = imageIds[0];

  const generalSeries = metaData.get(MetadataModules.GENERAL_SERIES, imageId0);
  if (!generalSeries) {
    return false;
  }
  const { modality, seriesInstanceUID } = generalSeries;

  const imagePlane = metaData.get(MetadataModules.IMAGE_PLANE, imageId0);
  if (!imagePlane) {
    return false;
  }
  const {
    imageOrientationPatient,
    pixelSpacing,
    frameOfReferenceUID,
    columns,
    rows,
    usingDefaultValues,
  } = imagePlane;

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
    const general = metaData.get(MetadataModules.GENERAL_SERIES, imageId);
    const plane = metaData.get(MetadataModules.IMAGE_PLANE, imageId);
    if (!general || !plane) {
      validVolume = false;
      break;
    }
    const { modality, seriesInstanceUID } = general;
    const { imageOrientationPatient, pixelSpacing, columns, rows } = plane;

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

  return (
    validVolume &&
    framesAlignWithVolumeGrid(imageIds, baseMetadata.imageOrientationPatient)
  );
}

/**
 * Checks that every image lies within half a slice of the evenly spaced grid
 * the volume is built on.
 *
 * The volume is built on a single spacing, the distance between the first and
 * last images along the scan axis divided by the number of gaps (see
 * calculateSpacingBetweenImageIds). On an unevenly spaced stack, slice k of the
 * volume is then not image k: an image more than half a slice off its grid
 * position is drawn, and edited, at a neighbouring slice.
 *
 * Images without a position are skipped, and a stack whose images do not move
 * along the scan axis is accepted: the spacing then falls back to the slice
 * metadata, so there is no grid to check against.
 *
 * @param imageIds - The imageIds to check.
 * @param imageOrientationPatient - The orientation shared by all the images.
 * @returns false if an image is more than half a slice off the grid.
 */
function framesAlignWithVolumeGrid(
  imageIds: string[],
  imageOrientationPatient: number[]
): boolean {
  if (imageIds.length < 3 || !imageOrientationPatient) {
    return true;
  }

  const rowCosine = vec3.fromValues(
    imageOrientationPatient[0],
    imageOrientationPatient[1],
    imageOrientationPatient[2]
  );
  const columnCosine = vec3.fromValues(
    imageOrientationPatient[3],
    imageOrientationPatient[4],
    imageOrientationPatient[5]
  );
  const scanAxis = vec3.cross(vec3.create(), rowCosine, columnCosine);

  const distances: number[] = [];

  for (const imageId of imageIds) {
    const position = metaData.get(
      MetadataModules.IMAGE_PLANE,
      imageId
    )?.imagePositionPatient;

    if (position) {
      distances.push(
        vec3.dot(
          vec3.fromValues(position[0], position[1], position[2]),
          scanAxis
        )
      );
    }
  }

  if (distances.length < 3) {
    return true;
  }

  distances.sort((a, b) => a - b);

  const first = distances[0];
  const spacing =
    (distances[distances.length - 1] - first) / (distances.length - 1);

  if (!(spacing > 0)) {
    return true;
  }

  return distances.every(
    (distance, index) =>
      Math.abs(distance - (first + index * spacing)) <= spacing / 2
  );
}

export { isValidVolume };
