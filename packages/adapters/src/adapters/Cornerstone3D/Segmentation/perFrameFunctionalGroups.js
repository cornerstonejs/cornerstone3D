/**
 * Builds DICOM-conformant PerFrameFunctionalGroupsSequence for SEG export/load.
 * Matches what @cornerstonejs/adapters labelmapImagesFromBuffer expects:
 * - SegmentIdentificationSequence.ReferencedSegmentNumber
 * - DerivationImageSequence[0].SourceImageSequence[0] (ReferencedSOPInstanceUID, optional ReferencedFrameNumber)
 */

export function normalizeSharedFunctionalGroupsSequence(dataset) {
  const shared = dataset.SharedFunctionalGroupsSequence;

  if (Array.isArray(shared) && shared.length > 0) {
    dataset.SharedFunctionalGroupsSequence = shared[0];
  } else if (!shared || typeof shared !== 'object') {
    dataset.SharedFunctionalGroupsSequence = {};
  }
}

/**
 * @param {object} dataset - SEG dataset
 * @param {Array<{
 *   referencedSegmentNumber: number,
 *   sourceImageSequenceItem: { ReferencedSOPInstanceUID: string, ReferencedFrameNumber?: number },
 *   planeOrientationSequence?: object,
 *   planePositionSequence?: object,
 * }>} frames
 */
export function applyPerFrameFunctionalGroups(dataset, frames) {
  normalizeSharedFunctionalGroupsSequence(dataset);

  const validFrames = frames.filter(
    (frame) => frame?.sourceImageSequenceItem?.ReferencedSOPInstanceUID
  );

  const existing = dataset.PerFrameFunctionalGroupsSequence;
  const existingList = Array.isArray(existing) ? existing : [];

  dataset.NumberOfFrames = validFrames.length;
  dataset.PerFrameFunctionalGroupsSequence = validFrames.map((frame, index) => {
    const prior =
      existingList[index] && typeof existingList[index] === 'object'
        ? existingList[index]
        : {};

    const group = {
      ...prior,
      SegmentIdentificationSequence: {
        ReferencedSegmentNumber: frame.referencedSegmentNumber,
      },
      DerivationImageSequence: [
        {
          SourceImageSequence: [frame.sourceImageSequenceItem],
        },
      ],
    };

    if (frame.planeOrientationSequence) {
      group.PlaneOrientationSequence = frame.planeOrientationSequence;
    }
    if (frame.planePositionSequence) {
      group.PlanePositionSequence = frame.planePositionSequence;
    }

    return group;
  });
}
