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

function calculateRadiographicPixelSpacing(instance) {
  const {
    PixelSpacing,
    ImagerPixelSpacing,
    EstimatedRadiographicMagnificationFactor,
    PixelSpacingCalibrationType,
    PixelSpacingCalibrationDescription,
  } = instance;

  const isProjection = true;

  if (!ImagerPixelSpacing) {
    // If only Pixel Spacing is present, and this is a projection radiograph,
    // PixelSpacing should be used, but the user should be informed that
    // what it means is unknown
    return {
      PixelSpacing,
      type: CalibrationTypes.UNKNOWN,
      isProjection,
    };
  }

  if (!PixelSpacing) {
    if (!EstimatedRadiographicMagnificationFactor) {
      console.warn(
        'EstimatedRadiographicMagnificationFactor was not present. Unable to correct ImagerPixelSpacing.'
      );

      return {
        PixelSpacing: ImagerPixelSpacing,
        type: CalibrationTypes.PROJECTION,
        isProjection,
      };
    }
    // Note that in IHE Mammo profile compliant displays, the value of Imager Pixel Spacing is required to be corrected by
    // Estimated Radiographic Magnification Factor and the user informed of that.
    // TODO: should this correction be done before all of this logic?
    const correctedPixelSpacing = ImagerPixelSpacing.map(
      (pixelSpacing) => pixelSpacing / EstimatedRadiographicMagnificationFactor
    );

    return {
      PixelSpacing: correctedPixelSpacing,
      type: CalibrationTypes.ERMF,
      isProjection,
    };
  }

  if (isEqual(PixelSpacing, ImagerPixelSpacing)) {
    // If Imager Pixel Spacing and Pixel Spacing are present and they have the same values,
    // then the user should be informed that the measurements are at the detector plane
    return {
      PixelSpacing,
      type: CalibrationTypes.PROJECTION,
      isProjection,
    };
  }

  if (PixelSpacingCalibrationType || PixelSpacingCalibrationDescription) {
    // If Imager Pixel Spacing and Pixel Spacing are present and they have different values,
    // then the user should be informed that these are "calibrated"
    return {
      PixelSpacing,
      type: CalibrationTypes.CALIBRATED,
      isProjection,
      PixelSpacingCalibrationType,
      PixelSpacingCalibrationDescription,
    };
  }

  // PixelSpacing should be used, but the user should be informed that
  // what it means is unknown
  return {
    PixelSpacing,
    type: CalibrationTypes.UNKNOWN,
    isProjection,
  };
}

function calculateUSPixelSpacing(instance) {
  const { SequenceOfUltrasoundRegions } = instance;
  const isArrayOfSequences = Array.isArray(SequenceOfUltrasoundRegions);

  if (isArrayOfSequences && SequenceOfUltrasoundRegions.length > 1) {
    console.warn(
      'Sequence of Ultrasound Regions > one entry. This is not yet implemented, all measurements will be shown in pixels.'
    );
    return;
  }

  const { PhysicalDeltaX, PhysicalDeltaY } = isArrayOfSequences
    ? SequenceOfUltrasoundRegions[0]
    : SequenceOfUltrasoundRegions;
  const USPixelSpacing = [PhysicalDeltaX * 10, PhysicalDeltaY * 10];

  return {
    PixelSpacing: USPixelSpacing,
  };
}

export default function getPixelSpacingInformation(instance) {
  // See http://gdcm.sourceforge.net/wiki/index.php/Imager_Pixel_Spacing
  // TODO: Add manual calibration

  const { PixelSpacing, SOPClassUID, SequenceOfUltrasoundRegions } = instance;

  if (SequenceOfUltrasoundRegions) {
    return calculateUSPixelSpacing(instance);
  }

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
