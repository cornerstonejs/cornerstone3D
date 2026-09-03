/**
 * Builds DICOM-conformant PerFrameFunctionalGroupsSequence for SEG export/load.
 * Matches what @cornerstonejs/adapters labelmapImagesFromBuffer expects:
 * - SegmentIdentificationSequence.ReferencedSegmentNumber
 * - DerivationImageSequence[0].SourceImageSequence[0] (ReferencedSOPInstanceUID, optional ReferencedFrameNumber)
 */

import { Enums, utilities } from '@cornerstonejs/core';

const { MetadataModules } = Enums;

/**
 * Resolves the 1-based DICOM frame number referenced by an imageId.
 *
 * Prefer the metadata provider's own frame extraction when it offers one — it
 * understands the full set of imageId shapes the host app produces (wadors
 * `/frames/N` as well as `?frame=N` / `&frame=N`). Fall back to the core
 * FrameRange helper (handles `/frames/N` and `frameNumber=N`) so that
 * provider-agnostic callers still resolve multi-frame references. A one-off
 * `/[?&]frame=/` regex silently drops the wadors form, so it must not be used.
 *
 * @param {string} imageId
 * @param {object} metadata - metadata provider
 * @returns {number|undefined}
 */
export function getReferencedFrameNumber(imageId, metadata) {
  if (!imageId) {
    return undefined;
  }

  const providerFrame = metadata?.getFrameInformationFromURL?.(imageId);
  const frameNumber =
    providerFrame != null
      ? Number(providerFrame)
      : utilities.FrameRange.imageIdToFrameStart(imageId);

  return Number.isFinite(frameNumber) ? frameNumber : undefined;
}

/**
 * Builds a SourceImageSequence item (ReferencedSOPInstanceUID + optional
 * ReferencedFrameNumber) for a cornerstone image, using the shared frame
 * extraction so all SEG export paths resolve multi-frame references identically.
 *
 * @param {{ imageId?: string }} image
 * @param {object} metadata - metadata provider
 * @returns {{ ReferencedSOPInstanceUID: string, ReferencedFrameNumber?: number }}
 */
export function getReferencedSourceImageSequenceItem(image, metadata) {
  const imageData =
    metadata?.get?.(MetadataModules.IMAGE_DATA, image?.imageId) || {};
  const referencedFrameNumber = getReferencedFrameNumber(
    image?.imageId,
    metadata
  );

  const item = {
    ReferencedSOPInstanceUID: imageData.SOPInstanceUID,
  };

  if (Number.isFinite(referencedFrameNumber) && referencedFrameNumber > 0) {
    item.ReferencedFrameNumber = referencedFrameNumber;
  }

  return item;
}

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
 *   referencedSegmentNumber?: number,
 *   sourceImageSequenceItem: { ReferencedSOPInstanceUID: string, ReferencedFrameNumber?: number },
 *   planeOrientationSequence?: object,
 *   planePositionSequence?: object,
 * }>} frames
 *
 * `referencedSegmentNumber` drives the per-frame `SegmentIdentificationSequence`
 * macro (one segment per frame — BINARY SEGs). Omit it for LABELMAP SEGs: there a
 * single frame carries many segment labels as pixel values, so the standard
 * forbids the macro and a fixed `ReferencedSegmentNumber` would be wrong for any
 * label other than the one hard-coded.
 */
export function applyPerFrameFunctionalGroups(dataset, frames) {
  normalizeSharedFunctionalGroupsSequence(dataset);

  const validFrames = frames.filter(
    (frame) => frame?.sourceImageSequenceItem?.ReferencedSOPInstanceUID
  );

  const existing = dataset.PerFrameFunctionalGroupsSequence;
  const existingList = Array.isArray(existing) ? existing : [];

  const nextSequence = validFrames.map((frame, index) => {
    const prior =
      existingList[index] && typeof existingList[index] === 'object'
        ? existingList[index]
        : {};

    // Drop any inherited SegmentIdentificationSequence when this frame has no
    // referencedSegmentNumber (LABELMAP path) so the macro is truly absent.
    const { SegmentIdentificationSequence: _priorSegId, ...priorRest } = prior;

    const group = {
      ...priorRest,
      DerivationImageSequence: [
        {
          SourceImageSequence: [frame.sourceImageSequenceItem],
        },
      ],
    };

    if (frame.referencedSegmentNumber != null) {
      group.SegmentIdentificationSequence = {
        ReferencedSegmentNumber: frame.referencedSegmentNumber,
      };
    }

    if (frame.planeOrientationSequence) {
      group.PlaneOrientationSequence = frame.planeOrientationSequence;
    }
    if (frame.planePositionSequence) {
      group.PlanePositionSequence = frame.planePositionSequence;
    }

    return group;
  });

  dataset.PerFrameFunctionalGroupsSequence = nextSequence;
  dataset.NumberOfFrames = nextSequence.length;
}
