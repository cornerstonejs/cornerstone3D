import { Enums, utilities } from '@cornerstonejs/core';

const { CalibrationTypes } = Enums;
const PIXEL_UNITS = 'px';

const SUPPORTED_REGION_DATA_TYPES = [
  1, // Tissue
];

const SUPPORTED_LENGTH_VARIANT = [
  '3,3', // x: cm  &  y:cm
];

const SUPPORTED_PROBE_VARIANT = [
  '4,3', // x: seconds  &  y : cm
];

const UNIT_MAPPING = {
  3: 'cm',
  4: 'seconds',
};

const EPS = 1e-3;
const SQUARE = '\xb2';
/**
 * Extracts the calibrated length units, area units, and the scale
 * for converting from internal spacing to image spacing.
 *
 * @param handles - to detect if spacing information is different between points
 * @param image - to extract the calibration from
 * @returns Object containing the units, area units, and scale
 */
const getCalibratedLengthUnitsAndScale = (image, handles) => {
  const { calibration, hasPixelSpacing } = image;
  let units = hasPixelSpacing ? 'mm' : PIXEL_UNITS;
  let areaUnits = units + SQUARE;
  let scale = 1;
  let calibrationType = '';

  if (
    !calibration ||
    (!calibration.type && !calibration.sequenceOfUltrasoundRegions)
  ) {
    return { units, areaUnits, scale };
  }

  if (calibration.type === CalibrationTypes.UNCALIBRATED) {
    return { units: PIXEL_UNITS, areaUnits: PIXEL_UNITS + SQUARE, scale };
  }

  if (calibration.sequenceOfUltrasoundRegions) {
    let imageIndex1, imageIndex2;
    if (Array.isArray(handles) && handles.length === 2) {
      [imageIndex1, imageIndex2] = handles;
    } else if (typeof handles === 'function') {
      const points = handles();
      imageIndex1 = points[0];
      imageIndex2 = points[1];
    }

    let regions = calibration.sequenceOfUltrasoundRegions.filter(
      (region) =>
        imageIndex1[0] >= region.regionLocationMinX0 &&
        imageIndex1[0] <= region.regionLocationMaxX1 &&
        imageIndex1[1] >= region.regionLocationMinY0 &&
        imageIndex1[1] <= region.regionLocationMaxY1 &&
        imageIndex2[0] >= region.regionLocationMinX0 &&
        imageIndex2[0] <= region.regionLocationMaxX1 &&
        imageIndex2[1] >= region.regionLocationMinY0 &&
        imageIndex2[1] <= region.regionLocationMaxY1
    );

    // If we are not in a region at all we should show the underlying calibration
    // which might be the mm spacing for the image
    if (!regions?.length) {
      return { units, areaUnits, scale };
    }

    // if we are in a region then it is the question of whether we support it
    // or not. If we do not support it we should show px

    regions = regions.filter(
      (region) =>
        SUPPORTED_REGION_DATA_TYPES.includes(region.regionDataType) &&
        SUPPORTED_LENGTH_VARIANT.includes(
          `${region.physicalUnitsXDirection},${region.physicalUnitsYDirection}`
        )
    );

    if (!regions.length) {
      return { units: PIXEL_UNITS, areaUnits: PIXEL_UNITS + SQUARE, scale };
    }

    // Todo: expand on this logic
    const region = regions[0];

    const physicalDeltaX = Math.abs(region.physicalDeltaX);
    const physicalDeltaY = Math.abs(region.physicalDeltaY);

    // if we are in a supported region then we should check if the
    // physicalDeltaX and physicalDeltaY are the same. If they are not
    // then we should show px again, but if they are the same then we should
    // show the units
    const isSamePhysicalDelta = utilities.isEqual(
      physicalDeltaX,
      physicalDeltaY,
      EPS
    );

    if (isSamePhysicalDelta) {
      // 1 to 1 aspect ratio, we use just one of them
      scale = 1 / (physicalDeltaX * 10);
      calibrationType = 'US Region';
      units = 'mm';
      areaUnits = 'mm' + SQUARE;
    } else {
      // here we are showing at the aspect ratio of the physical delta
      // if they are not the same, then we should show px, but the correct solution
      // is to grab each point separately and scale them individually
      // Todo: implement this
      return { units: PIXEL_UNITS, areaUnits: PIXEL_UNITS + SQUARE, scale };
    }
  } else if (calibration.scale) {
    scale = calibration.scale;
  }

  // everything except REGION/Uncalibrated
  const types = [
    CalibrationTypes.ERMF,
    CalibrationTypes.USER,
    CalibrationTypes.ERROR,
    CalibrationTypes.PROJECTION,
  ];

  if (types.includes(calibration?.type)) {
    calibrationType = calibration.type;
  }

  return {
    units: units + (calibrationType ? ` ${calibrationType}` : ''),
    areaUnits: areaUnits + (calibrationType ? ` ${calibrationType}` : ''),
    scale,
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
    // for Probe tool
    const supportedRegionsMetadata =
      calibration.sequenceOfUltrasoundRegions.filter(
        (region) =>
          SUPPORTED_REGION_DATA_TYPES.includes(region.regionDataType) &&
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

    calibrationType = 'US Region';
    values = [xValue, yValue];
    units = [
      UNIT_MAPPING[region.physicalUnitsXDirection],
      UNIT_MAPPING[region.physicalUnitsYDirection],
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
