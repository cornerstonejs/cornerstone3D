import getNumberValues from './getNumberValues';
import {
  extractOrientationFromNMMultiframeMetadata,
  extractPositionFromNMMultiframeMetadata,
  isNMModality,
} from './NMHelpers';

/**
 * Extract orientation information from a metadata. It tries to get the orientation
 * from the Detector Information Sequence (for NM images) if image type equal
 * to RECON TOMO or RECON GATED TOMO
 * @param {*} metaData
 * @returns
 */
function extractOrientationFromMetadata(metaData) {
  let imageOrientationPatient = getNumberValues(metaData['00200037'], 6);

  // If orientation not valid to this point, trying to get the orientation
  // from the Detector Information Sequence (for NM images) with image type
  // equal to RECON TOMO or RECON GATED TOMO

  if (!imageOrientationPatient && isNMModality(metaData)) {
    imageOrientationPatient =
      extractOrientationFromNMMultiframeMetadata(metaData);
  }

  return imageOrientationPatient;
}

/**
 * Extract position information from a metaData. It tries to get the position
 * from the Detector Information Sequence (for NM images) if image type equal
 * to RECON TOMO or RECON GATED TOMO
 * @param {*} metaData
 * @returns
 */
function extractPositionFromMetadata(metaData) {
  let imagePositionPatient = getNumberValues(metaData['00200032'], 3);

  // If position not valid to this point, trying to get the position
  // from the Detector Information Sequence (for NM images)
  if (!imagePositionPatient && isNMModality(metaData)) {
    imagePositionPatient = extractPositionFromNMMultiframeMetadata(metaData);
  }

  return imagePositionPatient;
}

export { extractOrientationFromMetadata, extractPositionFromMetadata };
