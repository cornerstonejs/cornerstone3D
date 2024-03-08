import getNumberValues from './getNumberValues';
import isNMReconstructable from '../../isNMReconstructable';

/**
 * Get a subpart of Image Type dicom tag defined by index
 * @param {*} dataSet
 * @param {*} index 0 based index of the subtype
 */
function getImageTypeSubItemFromDataset(dataSet, index) {
  const imageType = dataSet.string('x00080008');

  if (imageType) {
    const subTypes = imageType.split('\\');

    if (subTypes.length > index) {
      return subTypes[index];
    }
  }

  return undefined;
}
/**
 * Extracts the orientation from NM multiframe dataset, if image type
 * equal to RECON TOMO or RECON GATED TOMO
 * @param {*} dataSet
 * @returns
 */
function extractOrientationFromNMMultiframeDataset(dataSet) {
  let imageOrientationPatient;
  const modality = dataSet.string('x00080060');

  if (modality?.includes('NM')) {
    const imageSubType = getImageTypeSubItemFromDataset(dataSet, 2);

    if (imageSubType && isNMReconstructable(imageSubType)) {
      if (dataSet.elements.x00540022) {
        imageOrientationPatient = getNumberValues(
          dataSet.elements.x00540022.items[0].dataSet,
          'x00200037',
          6
        );
      }
    }
  }

  return imageOrientationPatient;
}

/**
 * Extracts the position from NM multiframe dataset, if image type
 * equal to RECON TOMO or RECON GATED TOMO
 * @param {*} dataSet
 * @returns
 */
function extractPositionFromNMMultiframeDataset(dataSet) {
  let imagePositionPatient;
  const modality = dataSet.string('x00080060');

  if (modality?.includes('NM')) {
    const imageSubType = getImageTypeSubItemFromDataset(dataSet, 2);

    if (imageSubType && isNMReconstructable(imageSubType)) {
      if (dataSet.elements.x00540022) {
        imagePositionPatient = getNumberValues(
          dataSet.elements.x00540022.items[0].dataSet,
          'x00200032',
          3
        );
      }
    }
  }

  return imagePositionPatient;
}

/**
 * Extract orientation information from a dataset. It tries to get the orientation
 * from the Detector Information Sequence (for NM images) if image type equal
 * to RECON TOMO or RECON GATED TOMO
 * @param {*} dataSet
 * @returns
 */
function extractOrientationFromDataset(dataSet) {
  let imageOrientationPatient = getNumberValues(dataSet, 'x00200037', 6);

  // Trying to get the orientation from the Plane Orientation Sequence
  if (!imageOrientationPatient && dataSet.elements.x00209116) {
    imageOrientationPatient = getNumberValues(
      dataSet.elements.x00209116.items[0].dataSet,
      'x00200037',
      6
    );
  }

  // If orientation not valid to this point, trying to get the orientation
  // from the Detector Information Sequence (for NM images) with image type
  // equal to RECON TOMO or RECON GATED TOMO

  if (!imageOrientationPatient) {
    imageOrientationPatient =
      extractOrientationFromNMMultiframeDataset(dataSet);
  }

  return imageOrientationPatient;
}

/**
 * Extract position information from a dataset. It tries to get the position
 * from the Detector Information Sequence (for NM images) if image type equal
 * to RECON TOMO or RECON GATED TOMO
 * @param {*} dataSet
 * @returns
 */
function extractPositionFromDataset(dataSet) {
  let imagePositionPatient = getNumberValues(dataSet, 'x00200032', 3);

  // Trying to get the position from the Plane Position Sequence
  if (!imagePositionPatient && dataSet.elements.x00209113) {
    imagePositionPatient = getNumberValues(
      dataSet.elements.x00209113.items[0].dataSet,
      'x00200032',
      3
    );
  }

  // If position not valid to this point, trying to get the position
  // from the Detector Information Sequence (for NM images)
  if (!imagePositionPatient) {
    imagePositionPatient = extractPositionFromNMMultiframeDataset(dataSet);
  }

  return imagePositionPatient;
}

/**
 * Extract the pixelSpacing information. If exists, extracts this information
 * from Pixel Measures Sequence
 * @param {*} dataSet
 * @returns
 */
function extractSpacingFromDataset(dataSet) {
  let pixelSpacing = getNumberValues(dataSet, 'x00280030', 2);

  // If pixelSpacing not valid to this point, trying to get the spacing
  // from the Pixel Measures Sequence
  if (!pixelSpacing && dataSet.elements.x00289110) {
    pixelSpacing = getNumberValues(
      dataSet.elements.x00289110.items[0].dataSet,
      'x00280030',
      2
    );
  }

  return pixelSpacing;
}

/**
 * Extract the sliceThickness information. If exists, extracts this information
 * from Pixel Measures Sequence
 * @param {*} dataSet
 * @returns
 */
function extractSliceThicknessFromDataset(dataSet) {
  let sliceThickness;

  if (dataSet.elements.x00180050) {
    sliceThickness = dataSet.floatString('x00180050');
  } else if (
    dataSet.elements.x00289110 &&
    dataSet.elements.x00289110.items.length &&
    dataSet.elements.x00289110.items[0].dataSet.elements.x00180050
  ) {
    sliceThickness =
      dataSet.elements.x00289110.items[0].dataSet.floatString('x00180050');
  }

  return sliceThickness;
}

export {
  getImageTypeSubItemFromDataset,
  extractOrientationFromDataset,
  extractPositionFromDataset,
  extractSpacingFromDataset,
  extractSliceThicknessFromDataset,
};
