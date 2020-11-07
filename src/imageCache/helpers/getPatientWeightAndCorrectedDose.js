import cornerstone from 'cornerstone-core';

export default function getPatientWeightAndCorrectedDose(imageId) {
  const seriesModule = cornerstone.metaData.get('generalSeriesModule', imageId);

  const patientStudyModule = cornerstone.metaData.get(
    'patientStudyModule',
    imageId
  );

  if (!patientStudyModule) {
    throw new Error('patientStudyModule metadata is required');
  }

  const patientWeight = patientStudyModule.patientWeight; // In kg

  if (!patientWeight) {
    throw new Error(
      'patientWeight must be present in patientStudyModule for modality PT'
    );
  }

  const petSequenceModule = cornerstone.metaData.get(
    'petIsotopeModule',
    imageId
  );

  if (!petSequenceModule) {
    throw new Error('petSequenceModule metadata is required');
  }

  // TODO:
  // - Update this to match the SUV logic provided here:
  //   https://github.com/salimkanoun/fijiPlugins/blob/master/Pet_Ct_Viewer/src/SUVDialog.java
  // - Test with PET datasets from various providers to ensure SUV is correct
  const radiopharmaceuticalInfo = petSequenceModule.radiopharmaceuticalInfo;
  const startTime = radiopharmaceuticalInfo.radiopharmaceuticalStartTime;
  const totalDose = radiopharmaceuticalInfo.radionuclideTotalDose;
  const halfLife = radiopharmaceuticalInfo.radionuclideHalfLife;
  const seriesAcquisitionTime = seriesModule.seriesTime;

  if (!startTime || !totalDose || !halfLife || !seriesAcquisitionTime) {
    throw new Error(
      'The required radiopharmaceutical information was not present.'
    );
  }

  const acquisitionTimeInSeconds =
    _fracToDec(seriesAcquisitionTime.fractionalSeconds || 0) +
    seriesAcquisitionTime.seconds +
    seriesAcquisitionTime.minutes * 60 +
    seriesAcquisitionTime.hours * 60 * 60;
  const injectionStartTimeInSeconds =
    _fracToDec(startTime.fractionalSeconds) +
    startTime.seconds +
    startTime.minutes * 60 +
    startTime.hours * 60 * 60;
  const durationInSeconds =
    acquisitionTimeInSeconds - injectionStartTimeInSeconds;
  const correctedDose =
    totalDose * Math.exp((-durationInSeconds * Math.log(2)) / halfLife);

  return { patientWeight, correctedDose };
}

/**
 * Returns a decimal value given a fractional value.
 * @private
 * @method
 * @name _fracToDec
 *
 * @param  {number} fractionalValue The value to convert.
 * @returns {number}                 The value converted to decimal.
 */
function _fracToDec(fractionalValue) {
  return parseFloat(`.${fractionalValue}`);
}
