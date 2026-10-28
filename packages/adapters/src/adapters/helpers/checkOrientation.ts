import checkIfPerpendicular from './checkIfPerpendicular';
import { utilities } from '@cornerstonejs/core';

export default function checkOrientation(
  multiframe,
  validOrientations,
  sourceDataDimensions,
  tolerance
) {
  const { SharedFunctionalGroupsSequence, PerFrameFunctionalGroupsSequence } =
    multiframe;

  const sharedImageOrientationPatient =
    SharedFunctionalGroupsSequence?.PlaneOrientationSequence
      ?.ImageOrientationPatient;

  // Check if in plane.
  const PerFrameFunctionalGroups = PerFrameFunctionalGroupsSequence[0];

  const iopRaw =
    sharedImageOrientationPatient ||
    PerFrameFunctionalGroups?.PlaneOrientationSequence?.ImageOrientationPatient;

  // A SEG of images that have no Frame of Reference (2D ultrasound, endoscopy,
  // photographs) carries no plane orientation. Each of its pixels corresponds
  // to a pixel of the image referenced by its Derivation Image Functional
  // Group (PS3.3 A.51.5), so it is in-plane with its source by definition.
  if (!iopRaw) {
    return 'Planar';
  }

  // ImageOrientationPatient can arrive as DICOM DS strings (e.g. from DICOMweb
  // JSON metadata) while validOrientations are numeric source cosines. isEqual
  // is type-strict, so a string-vs-number mismatch would make an in-plane SEG
  // look perpendicular. Coerce to numbers before comparing.
  const iop = Array.isArray(iopRaw) ? iopRaw.map(Number) : iopRaw;

  const inPlane = validOrientations.some((operation) =>
    utilities.isEqual(iop, operation, tolerance)
  );

  if (inPlane) {
    return 'Planar';
  }

  if (
    checkIfPerpendicular(iop, validOrientations[0], tolerance) &&
    sourceDataDimensions.includes(multiframe.Rows) &&
    sourceDataDimensions.includes(multiframe.Columns)
  ) {
    // Perpendicular and fits on same grid.
    return 'Perpendicular';
  }

  return 'Oblique';
}
