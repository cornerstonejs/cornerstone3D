import { CalibrationTypes } from '../enums';

const lengthUnits = (handles, image): string => {
  const { calibration, hasPixelSpacing } = image;
  const units = hasPixelSpacing ? 'mm' : 'px;';
  if (!calibration) return units;
  if (calibration.SequenceOfUltrasoundRegions) return 'US Region';
  if (calibration.types === CalibrationTypes.USER) {
    return `${units} User Calibration`;
  }
  if (calibration.type === CalibrationTypes.ERMF) return `${units} ERMF`;
  if (calibration.type === CalibrationTypes.USER) return `${units} USER`;
  if (calibration.type === CalibrationTypes.PROJECTION) return `${units} PROJ`;
  return units;
};

const areaUnits = (handles, image): string => {
  const { calibration, hasPixelSpacing } = image;
  const units = hasPixelSpacing ? 'mm\xb2' : 'px\xb2';
  if (!calibration) return units;
  if (calibration.SequenceOfUltrasoundRegions) return 'US Region';
  if (calibration.types === CalibrationTypes.USER) {
    return `${units} User Calibration`;
  }
  if (calibration.type === CalibrationTypes.ERMF) return `${units} ERMF`;
  if (calibration.type === CalibrationTypes.USER) return `${units} USER`;
  if (calibration.type === CalibrationTypes.PROJECTION) return `${units} PROJ`;
  return units;
};

export default lengthUnits;

export { areaUnits, lengthUnits };
