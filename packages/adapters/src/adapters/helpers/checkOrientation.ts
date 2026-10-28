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
    SharedFunctionalGroupsSequence.PlaneOrientationSequence
      ? SharedFunctionalGroupsSequence.PlaneOrientationSequence
          .ImageOrientationPatient
      : undefined;

  // Check if in plane.
  const PerFrameFunctionalGroups = PerFrameFunctionalGroupsSequence[0];

  const iopRaw =
    sharedImageOrientationPatient ||
    PerFrameFunctionalGroups?.PlaneOrientationSequence?.ImageOrientationPatient;

  // A SEG without a Frame of Reference has no plane orientation: each frame
  // is on the pixel grid of the source image that it references.
  if (!iopRaw && !multiframe.FrameOfReferenceUID) {
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
