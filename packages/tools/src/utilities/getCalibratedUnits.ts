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
  '4,-2', // x: seconds (ms) & y : mV (ECG)
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
  /**
   * @deprecated An earlier build wrote -2 in the Y direction to mean "the X
   * axis is in milliseconds". The code put X-axis information in a Y-axis
   * field, so an area measurement reported the wrong unit. An ECG region now
   * writes -1 for millivolts, and the display converts seconds to milliseconds.
   * The entry stays so that stored data with -2 still reads.
   */
  [-2]: 'mV',
};

const SQUARE = '\xb2';

const MS_PER_SECOND = 1000;
/** Unit of the X axis of an ECG region, as the display reports it. */
const ECG_TIME_UNIT = 'ms';
/** Unit of the Y axis of an ECG region. */
const ECG_AMPLITUDE_UNIT = 'mV';

/**
 * Returns true when the region describes an ECG waveform.
 *
 * The Y direction carries the Cornerstone extension code -1 for millivolts. The
 * code -2 stays accepted, because an earlier build wrote -2 to mean "the X axis
 * is in milliseconds". The X axis now keeps the DICOM code for seconds, and the
 * display converts to milliseconds.
 */
function isECGRegion(region): boolean {
  return (
    region.physicalUnitsYDirection === -1 ||
    region.physicalUnitsYDirection === -2
  );
}

/**
 * Returns true when the annotation spans more of the amplitude axis than of the
 * time axis.
 *
 * The test normalizes each axis against the extent of the region, so it
 * compares two dimensionless fractions. A direct comparison of the two physical
 * values is meaningless, because a time in seconds and an amplitude in
 * millivolts have no common unit.
 */
function isAnnotationVertical(region, handles): boolean {
  if (!handles || handles.length < 2) {
    return false;
  }

  const xExtent = Math.abs(
    region.regionLocationMaxX1 - region.regionLocationMinX0
  );
  const yExtent = Math.abs(
    region.regionLocationMaxY1 - region.regionLocationMinY0
  );

  if (!xExtent || !yExtent) {
    return false;
  }

  let maxSampleDelta = 0;
  let maxAmplitudeDelta = 0;

  for (let index = 1; index < handles.length; index++) {
    maxSampleDelta = Math.max(
      maxSampleDelta,
      Math.abs(handles[index][0] - handles[0][0])
    );
    maxAmplitudeDelta = Math.max(
      maxAmplitudeDelta,
      Math.abs(handles[index][1] - handles[0][1])
    );
  }

  return maxAmplitudeDelta / yExtent > maxSampleDelta / xExtent;
}

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
    } else if (region && isECGRegion(region)) {
      const physicalDeltaX = Math.abs(region.physicalDeltaX);
      const physicalDeltaY = Math.abs(region.physicalDeltaY);

      calibrationType = 'ECG Region';

      // The X axis of an ECG region is in seconds, and a clinical reader works
      // in milliseconds. The region keeps the DICOM unit code for seconds, and
      // the conversion to milliseconds belongs here, in the display layer.
      scale = 1 / (physicalDeltaX * MS_PER_SECOND);
      scaleY = 1 / physicalDeltaY;

      // Decide the axis from the direction of the annotation on the canvas, and
      // not from the physical values. A time in seconds and an amplitude in
      // millivolts have no common unit, so a comparison of the two is
      // meaningless.
      const isVertical = isAnnotationVertical(region, handles);

      if (isVertical) {
        // A vertical annotation measures amplitude, so the caller must scale
        // the Y component. `scale` stays on the X axis, because
        // `calculateLengthInIndex` applies `scale` to the X component and
        // `scaleY` to the Y component.
        unit = ECG_AMPLITUDE_UNIT;
      } else {
        unit = ECG_TIME_UNIT;
      }

      // The area of an ECG region is a time multiplied by an amplitude, so the
      // area has no square unit. Report the product.
      areaUnit = `${ECG_TIME_UNIT}\xb7${ECG_AMPLITUDE_UNIT}`;
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

    if (isECGRegion(region)) {
      // The X axis is in seconds, and the display reports milliseconds.
      calibrationType = 'ECG Region';
      values = [xValue * MS_PER_SECOND, yValue];
      units = [ECG_TIME_UNIT, ECG_AMPLITUDE_UNIT];
    } else {
      calibrationType = 'US Region';
      values = [xValue, yValue];
      units = [
        UNIT_MAPPING[region.physicalUnitsXDirection] ?? 'unknown',
        UNIT_MAPPING[region.physicalUnitsYDirection] ?? 'unknown',
      ];
    }
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
