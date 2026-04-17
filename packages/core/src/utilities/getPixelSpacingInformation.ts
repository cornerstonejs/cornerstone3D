import { isEqual } from './isEqual';
import { CalibrationTypes } from '../enums';

// TODO: Use ENUMS from dcmjs
const projectionRadiographSOPClassUIDs = new Set([
  '1.2.840.10008.5.1.4.1.1.1', //	CR Image Storage
  '1.2.840.10008.5.1.4.1.1.1.1', //	Digital X-Ray Image Storage – for Presentation
  '1.2.840.10008.5.1.4.1.1.1.1.1', //	Digital X-Ray Image Storage – for Processing
  '1.2.840.10008.5.1.4.1.1.1.2', //	Digital Mammography X-Ray Image Storage – for Presentation
  '1.2.840.10008.5.1.4.1.1.1.2.1', //	Digital Mammography X-Ray Image Storage – for Processing
  '1.2.840.10008.5.1.4.1.1.1.3', //	Digital Intra – oral X-Ray Image Storage – for Presentation
  '1.2.840.10008.5.1.4.1.1.1.3.1', //	Digital Intra – oral X-Ray Image Storage – for Processing
  '1.2.840.10008.5.1.4.1.1.12.1', //	X-Ray Angiographic Image Storage
  '1.2.840.10008.5.1.4.1.1.12.1.1', //	Enhanced XA Image Storage
  '1.2.840.10008.5.1.4.1.1.12.2', //	X-Ray Radiofluoroscopic Image Storage
  '1.2.840.10008.5.1.4.1.1.12.2.1', //	Enhanced XRF Image Storage
  '1.2.840.10008.5.1.4.1.1.12.3', // X-Ray Angiographic Bi-plane Image Storage	Retired
]);

/**
 * Calculates the ERMF value using any of:
 *   * EstimatedRadiographicMagnificationFactor
 *   * PixelSpacing / Imager Pixel Spacing
 *   * Distance Source / imager / patient pair
 *
 * @returns ERMF if available.  True means the PixelSpacing has been pre-calculated
 */
export function getERMF(instance) {
  const {
    PixelSpacing,
    ImagerPixelSpacing,
    EstimatedRadiographicMagnificationFactor: ermf,
    // Naming is traditionally sid/sod here
    DistanceSourceToDetector: sid,
    DistanceSourceToPatient: sod,
  } = instance;
  if (ermf) {
    return ermf;
  }
  if (sod < sid) {
    return sid / sod;
  }
  if (ImagerPixelSpacing?.[0] > PixelSpacing?.[0]) {
    return true;
  }
}

const MeasurementMessages = Object.freeze({
  NOT_CALIBRATED: 'Measurements not calibrated.',
  CORRECTED_AT_MODALITY: 'Measurements corrected at modality.',
  NOT_CORRECTED_AT_DETECTOR:
    'Measurements not corrected. Measured size is at detector.',
  CORRECTED_USING_ERMF: 'Measurements corrected using the ERMF.',
  UNCERTAIN: 'Measurements are uncertain.',
  USER_CALIBRATED: 'Measurements are user calibrated.',
});

function hasSpacing(spacing) {
  return Array.isArray(spacing) && spacing.length === 2;
}

function isValidSpacing(spacing) {
  return (
    hasSpacing(spacing) &&
    spacing.every(
      (value) => Number.isFinite(Number(value)) && Number(value) > 0
    )
  );
}

/**
 * Given an instance, calculates the project (radiographic) pixel spacing
 * plus the type of calibration that got used for it.
 *
 * This will be Calibrated if the calibration type is Fiducial (calibration)
 *
 * It will be ERMF if Pixel Spacing is present, and the calibration is GEOMETRY
 *
 * It will be ERMF if Imager Pixel Spacing is present and ermf is defined in some
 * format.
 *
 * It will be projection if imager pixel spacing is defined, but no ermf
 *
 * It will be unknown if pixel spacing is defined
 *
 * Otherwise it will be undefined (no spacing).
 */
export function calculateRadiographicPixelSpacing(instance) {
  const { PixelSpacing, ImagerPixelSpacing, PixelSpacingCalibrationType } =
    instance;

  const isProjection = true;
  const hasPixelSpacing = hasSpacing(PixelSpacing);
  const hasImagerPixelSpacing = hasSpacing(ImagerPixelSpacing);
  const hasValidImagerPixelSpacing = isValidSpacing(ImagerPixelSpacing);

  // This tag says that the pixel spacing has been manually calibrated
  if (hasPixelSpacing && PixelSpacingCalibrationType === 'FIDUCIAL') {
    return {
      PixelSpacing,
      type: CalibrationTypes.CALIBRATED,
      isProjection,
      Message: MeasurementMessages.USER_CALIBRATED,
    };
  }

  // Explicit geometry calibration from the modality
  if (hasPixelSpacing && PixelSpacingCalibrationType === 'GEOMETRY') {
    if (hasImagerPixelSpacing && isEqual(PixelSpacing, ImagerPixelSpacing)) {
      console.warn(
        'Calibration type is geometry, but pixel spacing and imager pixel spacing are identical',
        PixelSpacing,
        ImagerPixelSpacing
      );
    }

    return {
      PixelSpacing,
      type: CalibrationTypes.ERMF,
      isProjection,
      Message: MeasurementMessages.CORRECTED_AT_MODALITY,
    };
  }

  if (hasImagerPixelSpacing) {
    const ermf = getERMF(instance);
    // The IHE Mammo profile specifies that the value of Imager Pixel Spacing is required to be corrected by
    // Estimated Radiographic Magnification Factor and the user informed of that.
    if (typeof ermf === 'number' && ermf > 1) {
      const correctedPixelSpacing = ImagerPixelSpacing.map(
        (pixelSpacing) => pixelSpacing / ermf
      );

      return {
        PixelSpacing: correctedPixelSpacing,
        type: CalibrationTypes.ERMF,
        isProjection,
        Message: MeasurementMessages.CORRECTED_USING_ERMF,
      };
    }

    if (ermf === true) {
      // PixelSpacing already updated/correct, don't tweak it again
      return {
        PixelSpacing: PixelSpacing || ImagerPixelSpacing,
        type: CalibrationTypes.ERMF,
        isProjection,
        Message: MeasurementMessages.CORRECTED_USING_ERMF,
      };
    }

    if (ermf) {
      console.error('Illegal ERMF value:', ermf);
    }

    if (hasValidImagerPixelSpacing && hasPixelSpacing) {
      return {
        PixelSpacing,
        type: CalibrationTypes.PROJECTION,
        isProjection,
        Message: MeasurementMessages.CORRECTED_AT_MODALITY,
      };
    }

    if (hasValidImagerPixelSpacing) {
      return {
        PixelSpacing: ImagerPixelSpacing,
        type: CalibrationTypes.PROJECTION,
        isProjection,
        Message: MeasurementMessages.NOT_CORRECTED_AT_DETECTOR,
      };
    }
  }

  // PS is present, but IPS is absent/invalid (or IPS+ERMF combination is not trustworthy)
  if (hasPixelSpacing) {
    return {
      PixelSpacing,
      type: CalibrationTypes.UNKNOWN,
      isProjection,
      Message: MeasurementMessages.UNCERTAIN,
    };
  }

  // Neither PS nor IPS is usable
  return {
    PixelSpacing,
    type: CalibrationTypes.UNKNOWN,
    isProjection,
    Message: MeasurementMessages.NOT_CALIBRATED,
  };
}

export function getPixelSpacingInformation(instance) {
  // See http://gdcm.sourceforge.net/wiki/index.php/Imager_Pixel_Spacing
  // TODO: Add manual calibration

  const { PixelSpacing, SOPClassUID } = instance;

  const isProjection = projectionRadiographSOPClassUIDs.has(SOPClassUID);

  if (isProjection) {
    return calculateRadiographicPixelSpacing(instance);
  }

  return {
    PixelSpacing,
    type: CalibrationTypes.NOT_APPLICABLE,
    isProjection: false,
  };
}

export default getPixelSpacingInformation;
