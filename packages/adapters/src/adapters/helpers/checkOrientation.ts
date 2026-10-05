import checkIfPerpendicular from './checkIfPerpendicular';
import { utilities } from '@cornerstonejs/core';

/**
 * Determines the orientation of a SEG relative to the source image stack.
 *
 * Per DICOM PS3.3 C.7.6.16, PlaneOrientationSequence may appear in either:
 * - SharedFunctionalGroupsSequence (when orientation is constant across frames)
 * - PerFrameFunctionalGroupsSequence (when orientation varies per frame)
 *
 * This function checks both locations, preferring shared over per-frame.
 */
export default function checkOrientation(
  multiframe,
  validOrientations,
  sourceDataDimensions,
  tolerance
) {
  const { SharedFunctionalGroupsSequence, PerFrameFunctionalGroupsSequence } =
    multiframe;

  /**
   * Per DICOM, PlaneOrientationSequence appears in SharedFunctionalGroupsSequence
   * when the orientation is constant for all frames (typical for SEG).
   */
  const sharedImageOrientationPatient =
    SharedFunctionalGroupsSequence?.PlaneOrientationSequence
      ?.ImageOrientationPatient;

  /**
   * Fall back to PerFrameFunctionalGroupsSequence[0] if shared doesn't have it.
   * Per DICOM PS3.3 C.7.6.16, a functional group appears in only one location.
   */
  let iopRaw = sharedImageOrientationPatient;
  if (
    !iopRaw &&
    Array.isArray(PerFrameFunctionalGroupsSequence) &&
    PerFrameFunctionalGroupsSequence.length > 0
  ) {
    const firstPerFrame = PerFrameFunctionalGroupsSequence[0];
    iopRaw = firstPerFrame?.PlaneOrientationSequence?.ImageOrientationPatient;
  }

  if (!iopRaw) {
    /**
     * No ImageOrientationPatient found in shared or per-frame functional groups.
     * This indicates a non-compliant SEG (missing required orientation data).
     * Default to 'Planar' to allow loading with a warning rather than crashing.
     */
    console.warn(
      '[checkOrientation] No ImageOrientationPatient found in SharedFunctionalGroupsSequence ' +
        'or PerFrameFunctionalGroupsSequence. Defaulting to Planar orientation.'
    );
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
