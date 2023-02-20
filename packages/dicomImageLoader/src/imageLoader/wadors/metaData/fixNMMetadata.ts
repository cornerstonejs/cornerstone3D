import getTagValue from '../getTagValue.js';

export default function fixNMMetadata(metaData) {
  if (!metaData['00200032'] || metaData['00200037']) {
    // adjust metadata in case of multiframe NM data, as the dicom tags
    // 00200032 and 00200037 could be found only in the dicom tag 00540022
    const detectorInformationSequence = getTagValue(metaData['00540022']);

    if (detectorInformationSequence) {
      metaData['00200032'] = detectorInformationSequence['00200032'];
      metaData['00200037'] = detectorInformationSequence['00200037'];
    }
  }

  return metaData;
}
