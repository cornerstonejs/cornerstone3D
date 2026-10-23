const toList = (value) =>
  value === undefined || value === null
    ? []
    : Array.isArray(value)
      ? value
      : [value];

/**
 * Removes the Frame of Reference module. A SEG whose frames have no patient
 * position must not have an empty FrameOfReferenceUID (Type 1).
 */
export function removeFrameOfReference(dataset) {
  delete dataset.FrameOfReferenceUID;
  delete dataset.PositionReferenceIndicator;
}

/**
 * Writes an empty PatientOrientation when the dataset has none. The General
 * Image module requires it (Type 2C) when the plane macros do not give the
 * orientation, and the Segmentation derivation does not write it.
 */
export function ensurePatientOrientation(dataset) {
  dataset.PatientOrientation ??= '';
}

/** Removes the Plane Position and Plane Orientation macros from all groups. */
export function removePlaneMacros(dataset) {
  const groups = [
    ...toList(dataset.SharedFunctionalGroupsSequence),
    ...toList(dataset.PerFrameFunctionalGroupsSequence),
  ];
  groups.forEach((group) => {
    delete group.PlanePositionSequence;
    delete group.PlaneOrientationSequence;
  });
}

/**
 * Keeps one item for each source instance in the ReferencedInstanceSequence
 * of each referenced series. A multi-frame source gives one item for each
 * frame otherwise.
 */
export function removeDuplicateReferencedInstances(dataset) {
  toList(dataset.ReferencedSeriesSequence).forEach((series) => {
    const seen = new Set<string>();
    series.ReferencedInstanceSequence = toList(
      series.ReferencedInstanceSequence
    ).filter((instance) => {
      const uid = instance?.ReferencedSOPInstanceUID;
      if (!uid || seen.has(uid)) {
        return false;
      }
      seen.add(uid);
      return true;
    });
  });
}

/**
 * A copy of a SegmentSequence item without SegmentAlgorithmName for a MANUAL
 * segment: PS3.3 C.8.20.4 permits it only for an AUTOMATIC or SEMIAUTOMATIC
 * segment.
 */
export function toConformantSegment<T extends Record<string, unknown>>(
  segment: T
): T {
  if (segment.SegmentAlgorithmType !== 'MANUAL') {
    return { ...segment };
  }
  const { SegmentAlgorithmName: _name, ...rest } = segment;
  return rest as T;
}
