import { metaData } from '@cornerstonejs/core';
import type {
  InstanceMetadata,
  PhilipsPETPrivateGroup,
} from '@cornerstonejs/calculate-suv';

export default function getPTImageIdInstanceMetadata(
  imageId: string
): InstanceMetadata {
  const dicomMetaData = metaData.get('instance', imageId);

  if (!dicomMetaData) {
    throw new Error('dicom metadata are required');
  }

  const petSequenceModule = metaData.get('petIsotopeModule', imageId);

  if (!petSequenceModule) {
    throw new Error('petSequenceModule metadata is required');
  }

  const radiopharmaceuticalInfo = petSequenceModule.radiopharmaceuticalInfo;

  if (
    dicomMetaData.SeriesDate === undefined ||
    dicomMetaData.SeriesTime === undefined ||
    dicomMetaData.PatientWeight === undefined ||
    dicomMetaData.CorrectedImage === undefined ||
    dicomMetaData.Units === undefined ||
    radiopharmaceuticalInfo.radionuclideTotalDose === undefined ||
    radiopharmaceuticalInfo.radionuclideHalfLife === undefined ||
    dicomMetaData.DecayCorrection === undefined ||
    dicomMetaData.AcquisitionDate === undefined ||
    dicomMetaData.AcquisitionTime === undefined ||
    (radiopharmaceuticalInfo.radiopharmaceuticalStartDateTime === undefined &&
      dicomMetaData.SeriesDate === undefined &&
      radiopharmaceuticalInfo.radiopharmaceuticalStartTime === undefined)
  ) {
    throw new Error('required metadata are missing');
  }

  const instanceMetadata: InstanceMetadata = {
    CorrectedImage: dicomMetaData.CorrectedImage,
    Units: dicomMetaData.Units,
    RadionuclideHalfLife: radiopharmaceuticalInfo.radionuclideHalfLife,
    RadionuclideTotalDose: radiopharmaceuticalInfo.radionuclideTotalDose,
    DecayCorrection: dicomMetaData.DecayCorrection,
    PatientWeight: dicomMetaData.PatientWeight,
    SeriesDate: dicomMetaData.SeriesDate,
    SeriesTime: dicomMetaData.SeriesTime,
    AcquisitionDate: dicomMetaData.AcquisitionDate,
    AcquisitionTime: dicomMetaData.AcquisitionTime,
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
    dicomMetaData['70531000'] ||
    dicomMetaData['70531000'] !== undefined ||
    dicomMetaData['70531009'] ||
    dicomMetaData['70531009'] !== undefined
  ) {
    const philipsPETPrivateGroup: PhilipsPETPrivateGroup = {
      SUVScaleFactor: dicomMetaData['70531000'],
      ActivityConcentrationScaleFactor: dicomMetaData['70531009'],
    };
    instanceMetadata.PhilipsPETPrivateGroup = philipsPETPrivateGroup;
  }

  if (dicomMetaData['0009100d'] && dicomMetaData['0009100d'] !== undefined) {
    instanceMetadata.GEPrivatePostInjectionDateTime = dicomMetaData['0009100d'];
  }

  if (
    dicomMetaData.FrameReferenceTime &&
    dicomMetaData.FrameReferenceTime !== undefined
  ) {
    instanceMetadata.FrameReferenceTime = dicomMetaData.FrameReferenceTime;
  }

  if (
    dicomMetaData.ActualFrameDuration &&
    dicomMetaData.ActualFrameDuration !== undefined
  ) {
    instanceMetadata.ActualFrameDuration = dicomMetaData.ActualFrameDuration;
  }

  if (dicomMetaData.PatientSex && dicomMetaData.PatientSex !== undefined) {
    instanceMetadata.PatientSex = dicomMetaData.PatientSex;
  }

  if (dicomMetaData.PatientSize && dicomMetaData.PatientSize !== undefined) {
    instanceMetadata.PatientSize = dicomMetaData.PatientSize;
  }

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
