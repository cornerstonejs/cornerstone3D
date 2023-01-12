import { metaData } from '@cornerstonejs/core';
import type { InstanceMetadata } from '@cornerstonejs/calculate-suv';

export default function getPTImageIdInstanceMetadata(
  imageId: string
): InstanceMetadata {
  const petSequenceModule = metaData.get('petIsotopeModule', imageId);
  const generalSeriesModule = metaData.get('generalSeriesModule', imageId);
  const patientStudyModule = metaData.get('patientStudyModule', imageId);

  const ptSeriesModule = metaData.get('petSeriesModule', imageId);
  const ptImageModule = metaData.get('petImageModule', imageId);

  if (!petSequenceModule) {
    throw new Error('petSequenceModule metadata is required');
  }

  const radiopharmaceuticalInfo = petSequenceModule.radiopharmaceuticalInfo;

  const { seriesDate, seriesTime, acquisitionDate, acquisitionTime } =
    generalSeriesModule;
  const { patientWeight } = patientStudyModule;
  const { correctedImage, units, decayCorrection } = ptSeriesModule;

  if (
    seriesDate === undefined ||
    seriesTime === undefined ||
    patientWeight === undefined ||
    acquisitionDate === undefined ||
    acquisitionTime === undefined ||
    correctedImage === undefined ||
    units === undefined ||
    decayCorrection === undefined ||
    radiopharmaceuticalInfo.radionuclideTotalDose === undefined ||
    radiopharmaceuticalInfo.radionuclideHalfLife === undefined ||
    (radiopharmaceuticalInfo.radiopharmaceuticalStartDateTime === undefined &&
      seriesDate === undefined &&
      radiopharmaceuticalInfo.radiopharmaceuticalStartTime === undefined)
    //
  ) {
    throw new Error('required metadata are missing');
  }

  const instanceMetadata: InstanceMetadata = {
    CorrectedImage: correctedImage,
    Units: units,
    RadionuclideHalfLife: radiopharmaceuticalInfo.radionuclideHalfLife,
    RadionuclideTotalDose: radiopharmaceuticalInfo.radionuclideTotalDose,
    DecayCorrection: decayCorrection,
    PatientWeight: patientWeight,
    SeriesDate: seriesDate,
    SeriesTime: seriesTime,
    AcquisitionDate: acquisitionDate,
    AcquisitionTime: acquisitionTime,
  };

  if (
    radiopharmaceuticalInfo.radiopharmaceuticalStartDateTime &&
    radiopharmaceuticalInfo.radiopharmaceuticalStartDateTime !== undefined &&
    typeof radiopharmaceuticalInfo.radiopharmaceuticalStartDateTime === 'string'
  ) {
    instanceMetadata.RadiopharmaceuticalStartDateTime =
      radiopharmaceuticalInfo.radiopharmaceuticalStartDateTime;
  }

  if (
    radiopharmaceuticalInfo.radiopharmaceuticalStartDateTime &&
    radiopharmaceuticalInfo.radiopharmaceuticalStartDateTime !== undefined &&
    typeof radiopharmaceuticalInfo.radiopharmaceuticalStartDateTime !== 'string'
  ) {
    const dateString = convertInterfaceDateToString(
      radiopharmaceuticalInfo.radiopharmaceuticalStartDateTime
    );
    instanceMetadata.RadiopharmaceuticalStartDateTime = dateString;
  }

  if (
    instanceMetadata.AcquisitionDate &&
    instanceMetadata.AcquisitionDate !== undefined &&
    typeof instanceMetadata.AcquisitionDate !== 'string'
  ) {
    const dateString = convertInterfaceDateToString(
      instanceMetadata.AcquisitionDate
    );
    instanceMetadata.AcquisitionDate = dateString;
  }

  if (
    instanceMetadata.SeriesDate &&
    instanceMetadata.SeriesDate !== undefined &&
    typeof instanceMetadata.SeriesDate !== 'string'
  ) {
    const dateString = convertInterfaceDateToString(
      instanceMetadata.SeriesDate
    );
    instanceMetadata.SeriesDate = dateString;
  }

  if (
    radiopharmaceuticalInfo.radiopharmaceuticalStartTime &&
    radiopharmaceuticalInfo.radiopharmaceuticalStartTime !== undefined &&
    typeof radiopharmaceuticalInfo.radiopharmaceuticalStartTime === 'string'
  ) {
    instanceMetadata.RadiopharmaceuticalStartTime =
      radiopharmaceuticalInfo.radiopharmaceuticalStartTime;
  }

  if (
    radiopharmaceuticalInfo.radiopharmaceuticalStartTime &&
    radiopharmaceuticalInfo.radiopharmaceuticalStartTime !== undefined &&
    typeof radiopharmaceuticalInfo.radiopharmaceuticalStartTime !== 'string'
  ) {
    const timeString = convertInterfaceTimeToString(
      radiopharmaceuticalInfo.radiopharmaceuticalStartTime
    );
    instanceMetadata.RadiopharmaceuticalStartTime = timeString;
  }

  if (
    instanceMetadata.AcquisitionTime &&
    instanceMetadata.AcquisitionTime !== undefined &&
    typeof instanceMetadata.AcquisitionTime !== 'string'
  ) {
    const timeString = convertInterfaceTimeToString(
      instanceMetadata.AcquisitionTime
    );
    instanceMetadata.AcquisitionTime = timeString;
  }

  if (
    instanceMetadata.SeriesTime &&
    instanceMetadata.SeriesTime !== undefined &&
    typeof instanceMetadata.SeriesTime !== 'string'
  ) {
    const timeString = convertInterfaceTimeToString(
      instanceMetadata.SeriesTime
    );
    instanceMetadata.SeriesTime = timeString;
  }

  if (
    ptImageModule.frameReferenceTime &&
    ptImageModule.frameReferenceTime !== undefined
  ) {
    instanceMetadata.FrameReferenceTime = ptImageModule.frameReferenceTime;
  }

  if (
    ptImageModule.actualFrameDuration &&
    ptImageModule.actualFrameDuration !== undefined
  ) {
    instanceMetadata.ActualFrameDuration = ptImageModule.actualFrameDuration;
  }

  if (
    patientStudyModule.patientSex &&
    patientStudyModule.patientSex !== undefined
  ) {
    instanceMetadata.PatientSex = patientStudyModule.patientSex;
  }

  if (
    patientStudyModule.patientSize &&
    patientStudyModule.patientSize !== undefined
  ) {
    instanceMetadata.PatientSize = patientStudyModule.patientSize;
  }

  // Todo: add private tags
  // if (
  //   dicomMetaData['70531000'] ||
  //   dicomMetaData['70531000'] !== undefined ||
  //   dicomMetaData['70531009'] ||
  //   dicomMetaData['70531009'] !== undefined
  // ) {
  //   const philipsPETPrivateGroup: PhilipsPETPrivateGroup = {
  //     SUVScaleFactor: dicomMetaData['70531000'],
  //     ActivityConcentrationScaleFactor: dicomMetaData['70531009'],
  //   };
  //   instanceMetadata.PhilipsPETPrivateGroup = philipsPETPrivateGroup;
  // }

  // if (dicomMetaData['0009100d'] && dicomMetaData['0009100d'] !== undefined) {
  //   instanceMetadata.GEPrivatePostInjectionDateTime = dicomMetaData['0009100d'];
  // }

  return instanceMetadata;
}

function convertInterfaceTimeToString(time): string {
  const hours = `${time.hours || '00'}`.padStart(2, '0');
  const minutes = `${time.minutes || '00'}`.padStart(2, '0');
  const seconds = `${time.seconds || '00'}`.padStart(2, '0');

  const fractionalSeconds = `${time.fractionalSeconds || '000000'}`.padEnd(
    6,
    '0'
  );

  const timeString = `${hours}${minutes}${seconds}.${fractionalSeconds}`;
  return timeString;
}

function convertInterfaceDateToString(date): string {
  const month = `${date.month}`.padStart(2, '0');
  const day = `${date.day}`.padStart(2, '0');
  const dateString = `${date.year}${month}${day}`;
  return dateString;
}

export { getPTImageIdInstanceMetadata };
