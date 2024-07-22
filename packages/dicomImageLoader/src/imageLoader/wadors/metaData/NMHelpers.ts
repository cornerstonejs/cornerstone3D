import getTagValue from '../getTagValue';
import getValue from './getValue';
import isNMReconstructable from '../../isNMReconstructable';
import getNumberValues from './getNumberValues';

function isNMModality(metaData) {
  const modality = getValue(metaData['00080060']) as string;

  return modality.includes('NM');
}

/**
 * Get a subpart of Image Type dicom tag defined by index
 * @param {*} metaData
 * @param {*} index 0 based index of the subtype
 */
function getImageTypeSubItemFromMetadata(metaData, index) {
  const imageType = getTagValue(metaData['00080008'], false);

  if (imageType) {
    // const subTypes = imageType.split('\\');

    // if (subTypes.length > index) {
    //   return subTypes[index];
    // }
    return imageType[index];
  }

  return undefined;
}
/**
 * Extracts the orientation from NM multiframe metadata, if image type
 * equal to RECON TOMO or RECON GATED TOMO
 * @param {*} metaData
 * @returns
 */
function extractOrientationFromNMMultiframeMetadata(metaData) {
  let imageOrientationPatient;
  const imageSubType = getImageTypeSubItemFromMetadata(metaData, 2);

  if (imageSubType && isNMReconstructable(imageSubType)) {
    const detectorInformationSequence = getTagValue(metaData['00540022']);

    if (detectorInformationSequence) {
      imageOrientationPatient = getNumberValues(
        detectorInformationSequence['00200037'],
        6
      );
    }
  }

  return imageOrientationPatient;
}

/**
 * Extracts the position from NM multiframe dataset, if image type
 * equal to RECON TOMO or RECON GATED TOMO
 * @param {*} metaData
 * @returns
 */
function extractPositionFromNMMultiframeMetadata(metaData) {
  let imagePositionPatient;
  const imageSubType = getImageTypeSubItemFromMetadata(metaData, 2);

  if (imageSubType && isNMReconstructable(imageSubType)) {
    const detectorInformationSequence = getTagValue(metaData['00540022']);

    if (detectorInformationSequence) {
      imagePositionPatient = getNumberValues(
        detectorInformationSequence['00200032'],
        3
      );
    }
  }

  return imagePositionPatient;
}

export {
  extractOrientationFromNMMultiframeMetadata,
  extractPositionFromNMMultiframeMetadata,
  isNMModality,
  getImageTypeSubItemFromMetadata,
};
