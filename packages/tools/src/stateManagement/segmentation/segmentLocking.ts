import { getSegmentation } from '../../stateManagement/segmentation/getSegmentation';
import { triggerSegmentationModified } from './triggerSegmentationEvents';

/**
 * Get the locked status for a segment index in a segmentation
 * @param segmentationId - The id of the segmentation that the segment
 * belongs to.
 * @param segmentIndex - The index of the segment
 * @returns A boolean value indicating whether the segment is locked or not.
 */
function isSegmentIndexLocked(
  segmentationId: string,
  segmentIndex: number
): boolean {
  const segmentation = getSegmentation(segmentationId);

  if (!segmentation) {
    throw new Error(`No segmentation state found for ${segmentationId}`);
  }

  const { segments } = segmentation;
  return segments[segmentIndex].locked;
}

/**
 * Set the locked status of a segment index in a segmentation
 * @param segmentationId - The id of the segmentation whose segment
 * index is being modified.
 * @param segmentIndex - The index of the segment to lock/unlock.
 */
function setSegmentIndexLocked(
  segmentationId: string,
  segmentIndex: number,
  locked = true
): void {
  const segmentation = getSegmentation(segmentationId);

  if (!segmentation) {
    throw new Error(`No segmentation state found for ${segmentationId}`);
  }

  const { segments } = segmentation;

  segments[segmentIndex].locked = locked;

  triggerSegmentationModified(segmentationId);
}

/**
 * Get the locked segments for a segmentation
 * @param segmentationId - The id of the segmentation to get locked
 * segments for.
 * @returns An array of locked segment indices.
 */
function getLockedSegmentIndices(segmentationId: string): number[] | [] {
  const segmentation = getSegmentation(segmentationId);

  if (!segmentation) {
    throw new Error(`No segmentation state found for ${segmentationId}`);
  }

  const { segments } = segmentation;
  const lockedSegmentIndices = Object.keys(segments).filter(
    (segmentIndex) => segments[segmentIndex].locked
  );
  return lockedSegmentIndices.map((segmentIndex) => parseInt(segmentIndex));
}

export { isSegmentIndexLocked, setSegmentIndexLocked, getLockedSegmentIndices };
