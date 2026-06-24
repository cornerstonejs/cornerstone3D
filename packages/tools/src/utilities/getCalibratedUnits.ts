import { Enums } from '@cornerstonejs/core';

const { CalibrationTypes } = Enums;
const PIXEL_UNITS = 'px';
const VOXEL_UNITS = 'voxels';
/**
 * DICOM Region Data Types as defined in the DICOM standard
 * https://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_C.8.5.5.html#sect_C.8.5.5.1.2
 */
const SUPPORTED_REGION_DATA_TYPES = [
  1, // Tissue
  2, // Color Flow
  3, // PW Spectral Doppler
  4, // CW Spectral Doppler
];

const SUPPORTED_PROBE_VARIANT = [
  '4,3', // x: seconds & y : cm
  '4,7', // x: seconds & y : cm/sec
  '4,-1', // x: seconds & y : mV (ECG)
];

/**
 * DICOM Pixel Physical Units as defined in the DICOM standard
 * https://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_C.8.5.5.html#sect_C.8.5.5.1.6
 */
const UNIT_MAPPING = {
  0: 'px',
  1: 'percent',
  2: 'dB',
  3: 'cm',
  4: 'seconds',
  5: 'hertz',
  6: 'dB/seconds',
  7: 'cm/sec',
  8: 'cm\xb2',
  9: 'cm\xb2/s',
  0xc: 'degrees',
  /** Extension for ECG amplitude (not in DICOM table). */
  [-1]: 'mV',
};

const EPS = 1e-3;
const SQUARE = '\xb2';

// everything except REGION/Uncalibrated
const types = [
  CalibrationTypes.ERMF,
  CalibrationTypes.USER,
  CalibrationTypes.ERROR,
  CalibrationTypes.PROJECTION,
  CalibrationTypes.CALIBRATED,
  CalibrationTypes.UNKNOWN,
];

/**
 * Extracts the calibrated length units, area units, and the scale
 * for converting from internal spacing to image spacing.
 *
 * @param handles - to detect if spacing information is different between points
 * @param image - to extract the calibration from
 * @returns Object containing the units, area units, and scale
 */
const getCalibratedLengthUnitsAndScale = (image, handles) => {
  const { calibration, hasPixelSpacing, spacing = [1, 1, 1] } = image;
  let unit = hasPixelSpacing ? 'mm' : PIXEL_UNITS;
  const volumeUnit = hasPixelSpacing ? 'mm\xb3' : VOXEL_UNITS;
  let areaUnit = unit + SQUARE;
  const baseScale = calibration?.scale || 1;
  let scale = baseScale / (calibration?.columnPixelSpacing || spacing[0]);
  let scaleY = baseScale / (calibration?.rowPixelSpacing || spacing[1]);
  let scaleZ = baseScale / spacing[2];
  let calibrationType = '';

  if (
    !calibration ||
    (!calibration.type && !calibration.sequenceOfUltrasoundRegions)
  ) {
    return { unit, areaUnit, scale, scaleY, scaleZ, volumeUnit };
  }

  if (types.includes(calibration?.type)) {
    calibrationType = calibration.type;
  }

  if (calibration.type === CalibrationTypes.UNCALIBRATED) {
    return {
      unit: PIXEL_UNITS,
      areaUnit: PIXEL_UNITS + SQUARE,
      scale,
      scaleY,
      scaleZ,
      volumeUnit: VOXEL_UNITS,
    };
  }

  if (calibration.sequenceOfUltrasoundRegions) {
    const region = calibration.sequenceOfUltrasoundRegions.find(
      (region) =>
        handles.every(
          (handle) =>
            handle[0] >= region.regionLocationMinX0 &&
            handle[0] <= region.regionLocationMaxX1 &&
            handle[1] >= region.regionLocationMinY0 &&
            handle[1] <= region.regionLocationMaxY1
        ) &&
        (SUPPORTED_REGION_DATA_TYPES.includes(region.regionDataType) ||
          SUPPORTED_PROBE_VARIANT.includes(
            `${region.physicalUnitsXDirection},${region.physicalUnitsYDirection}`
          ))
    );

    if (
      region &&
      region.physicalUnitsXDirection === region.physicalUnitsYDirection
    ) {
      const physicalDeltaX = Math.abs(region.physicalDeltaX);
      const physicalDeltaY = Math.abs(region.physicalDeltaY);
      scale = 1 / physicalDeltaX;
      scaleY = 1 / physicalDeltaY;

      // 1 to 1 aspect ratio, we use just one of them
      calibrationType = 'US Region';
      unit = UNIT_MAPPING[region.physicalUnitsXDirection] || 'unknown';
      areaUnit = unit + SQUARE;
    } else if (region && region.physicalUnitsYDirection === -1) {
      const physicalDeltaX = Math.abs(region.physicalDeltaX);
      const physicalDeltaY = Math.abs(region.physicalDeltaY);
      scale = 1 / physicalDeltaX;
      scaleY = 1 / physicalDeltaY;

      calibrationType = 'ECG Region';
      unit =
        UNIT_MAPPING[region.physicalUnitsXDirection] ||
        UNIT_MAPPING[region.physicalUnitsYDirection] ||
        'unknown';
      areaUnit =
        (UNIT_MAPPING[region.physicalUnitsYDirection] || 'px') + SQUARE;
    }
  } else if (calibration.scale) {
    scale = calibration.scale;
  }

  return {
    unit: unit + (calibrationType ? ` ${calibrationType}` : ''),
    areaUnit: areaUnit + (calibrationType ? ` ${calibrationType}` : ''),
    volumeUnit: volumeUnit + (calibrationType ? ` ${calibrationType}` : ''),
    scale,
    scaleY,
    scaleZ,
  };
};

const getCalibratedProbeUnitsAndValue = (image, handles) => {
  const [imageIndex] = handles;
  const { calibration } = image;
  let units = ['raw'];
  let values = [null];
  let calibrationType = '';

  if (
    !calibration ||
    (!calibration.type && !calibration.sequenceOfUltrasoundRegions)
  ) {
    return { units, values };
    // Todo: add support for other scenarios
  }

  if (calibration.sequenceOfUltrasoundRegions) {
    const supportedRegionsMetadata =
      calibration.sequenceOfUltrasoundRegions.filter(
        (region) =>
          (SUPPORTED_REGION_DATA_TYPES.includes(region.regionDataType) ||
            SUPPORTED_PROBE_VARIANT.includes(
              `${region.physicalUnitsXDirection},${region.physicalUnitsYDirection}`
            )) &&
          SUPPORTED_PROBE_VARIANT.includes(
            `${region.physicalUnitsXDirection},${region.physicalUnitsYDirection}`
          )
      );

    if (!supportedRegionsMetadata?.length) {
      return { units, values };
    }

    const region = supportedRegionsMetadata.find(
      (region) =>
        imageIndex[0] >= region.regionLocationMinX0 &&
        imageIndex[0] <= region.regionLocationMaxX1 &&
        imageIndex[1] >= region.regionLocationMinY0 &&
        imageIndex[1] <= region.regionLocationMaxY1
    );

    if (!region) {
      return { units, values };
    }

    // Todo: I think this is a ok assumption for now that if the referencePixelX0 and referencePixelY0
    // are not defined, then we can assume 0 for them
    const { referencePixelX0 = 0, referencePixelY0 = 0 } = region;
    const { physicalDeltaX, physicalDeltaY } = region;

    const yValue =
      (imageIndex[1] - region.regionLocationMinY0 - referencePixelY0) *
      physicalDeltaY;

    const xValue =
      (imageIndex[0] - region.regionLocationMinX0 - referencePixelX0) *
      physicalDeltaX;

    calibrationType =
      region.physicalUnitsYDirection === -1 ? 'ECG Region' : 'US Region';
    values = [xValue, yValue];
    units = [
      UNIT_MAPPING[region.physicalUnitsXDirection] ?? 'unknown',
      UNIT_MAPPING[region.physicalUnitsYDirection] ?? 'unknown',
    ];
  }

  return {
    units,
    values,
    calibrationType,
  };
};

/** Gets the aspect ratio of the screen display relative to the image
 * display in order to square up measurement values.
 * That is, suppose the spacing on the image is 1, 0.5 (x,y spacing)
 * This is displayed at 1, 1 spacing on screen, then the
 * aspect value will be 1/0.5 = 2
 */
const getCalibratedAspect = (image) => image.calibration?.aspect || 1;

export {
  getCalibratedLengthUnitsAndScale,
  getCalibratedAspect,
  getCalibratedProbeUnitsAndValue,
};
