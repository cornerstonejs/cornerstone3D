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
    DistanceSourceToEntrance: soe,
    DistanceSourceToPatient: sod = soe,
  } = instance;
  if (ermf > 1) {
    return ermf;
  }
  if (sod < sid) {
    return sid / sod;
  }
  if (ImagerPixelSpacing?.[0] > PixelSpacing?.[0]) {
    return true;
  }
}

/**
 * Given an instance, calculates the project (radiographic) pixel spacing
 * plus the type of calibration that got used for it.
 */
export function calculateRadiographicPixelSpacing(instance) {
  const { PixelSpacing, ImagerPixelSpacing, PixelSpacingCalibrationType } =
    instance;

  const isProjection = true;

  if (PixelSpacing && PixelSpacingCalibrationType === 'GEOMETRY') {
    if (isEqual(PixelSpacing, ImagerPixelSpacing)) {
      console.warn(
        'Calibration type is geometry, but pixel spacing and imager pixel spacing identical',
        PixelSpacing,
        ImagerPixelSpacing
      );
    }
    return {
      PixelSpacing,
      type: CalibrationTypes.ERMF,
      isProjection,
    };
  }

  if (PixelSpacing && PixelSpacingCalibrationType === 'FIDUCIAL') {
    return {
      PixelSpacing,
      type: CalibrationTypes.CALIBRATED,
      isProjection,
    };
  }

  if (ImagerPixelSpacing) {
    const ermf = getERMF(instance);
    if (ermf > 1) {
      const correctedPixelSpacing = ImagerPixelSpacing.map(
        (pixelSpacing) => pixelSpacing / ermf
      );

      return {
        PixelSpacing: correctedPixelSpacing,
        type: CalibrationTypes.ERMF,
        isProjection,
      };
    }
    if (ermf === true) {
      return {
        PixelSpacing,
        type: CalibrationTypes.ERMF,
        isProjection,
      };
    }
    if (ermf) {
      console.error('Illegal ERMF value:', ermf);
    }
    return {
      PixelSpacing: PixelSpacing || ImagerPixelSpacing,
      type: CalibrationTypes.PROJECTION,
      isProjection,
    };
  }

  return {
    PixelSpacing,
    type: CalibrationTypes.UNKNOWN,
    isProjection,
  };
}

export function getPixelSpacingInformation(instance) {
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
