import { getActiveSegmentationRepresentation } from './activeSegmentation'

import { getSegmentation } from '../../stateManagement/segmentation/segmentationState'
import { triggerSegmentationModified } from './triggerSegmentationEvents'

/**
 * Get the locked status of a segment index in a segmentation
 *
 * @param toolGroupId - The Id of the tool group that contains the segmentation.
 * @param segmentIndex - The index of the segment
 * @returns A boolean value indicating whether the segment is locked or not for modification
 */
function getSegmentIndexLocked(
  toolGroupId: string,
  segmentIndex: number
): boolean {
  const activeSegmentationRepresentation =
    getActiveSegmentationRepresentation(toolGroupId)

  if (!activeSegmentationRepresentation) {
    throw new Error('element does not contain an active segmentation')
  }

  const { segmentationId } = activeSegmentationRepresentation
  const segmentationGlobalState = getSegmentation(segmentationId)
  const lockedSegments = segmentationGlobalState.segmentsLocked
  return lockedSegments.has(segmentIndex)
}

/**
 * Set the locked status of a segment in a segmentation globally. It fires
 * a Segmentation Modified event.
 *
 * @triggers {SegmentationModifiedEvent}
 *
 * @param toolGroupId - the UID of the tool group that contains the
 * segmentation
 * @param segmentIndex - the index of the segment to lock/unlock
 * @param locked - boolean
 */
// Todo: shouldn't this be a based on a segmentationId instead of a toolGroupId?
function setSegmentIndexLocked(
  toolGroupId: string,
  segmentIndex: number,
  locked = true
): void {
  const activeSegmentationRepresentation =
    getActiveSegmentationRepresentation(toolGroupId)

  if (!activeSegmentationRepresentation) {
    throw new Error('element does not contain an active segmentation')
  }

  const { segmentationId } = activeSegmentationRepresentation

  const segmentation = getSegmentation(segmentationId)
  const { segmentsLocked } = segmentation

  if (locked) {
    segmentsLocked.add(segmentIndex)
  } else {
    segmentsLocked.delete(segmentIndex)
  }

  triggerSegmentationModified(segmentationId)
}

/**
 * Get the locked status for a segment index in a segmentation
 * @param segmentationId - The id of the segmentation that the segment
 * belongs to.
 * @param segmentIndex - The index of the segment
 * @returns A boolean value indicating whether the segment is locked or not.
 */
function getSegmentIndexLockedForSegmentation(
  segmentationId: string,
  segmentIndex: number
): boolean {
  const segmentation = getSegmentation(segmentationId)

  if (!segmentation) {
    throw new Error(`No segmentation state found for ${segmentationId}`)
  }

  const { segmentsLocked } = segmentation
  return segmentsLocked.has(segmentIndex)
}

/**
 * Set the locked status of a segment index in a segmentation
 * @param segmentationId - The id of the segmentation whose segment
 * index is being modified.
 * @param segmentIndex - The index of the segment to lock/unlock.
 */
function setSegmentIndexLockedForSegmentation(
  segmentationId: string,
  segmentIndex: number,
  locked = true
): void {
  const segmentation = getSegmentation(segmentationId)

  if (!segmentation) {
    throw new Error(`No segmentation state found for ${segmentationId}`)
  }

  const { segmentsLocked } = segmentation

  if (locked) {
    segmentsLocked.add(segmentIndex)
  } else {
    segmentsLocked.delete(segmentIndex)
  }

  triggerSegmentationModified(segmentationId)
}

/**
 * Get the locked segments for a segmentation
 * @param segmentationId - The id of the segmentation to get locked
 * segments for.
 * @returns An array of locked segment indices.
 */
function getSegmentsLockedForSegmentation(
  segmentationId: string
): number[] | [] {
  const segmentation = getSegmentation(segmentationId)

  if (!segmentation) {
    throw new Error(`No segmentation state found for ${segmentationId}`)
  }

  const { segmentsLocked } = segmentation
  return Array.from(segmentsLocked)
}

export {
  // toolGroup active segmentation
  getSegmentIndexLocked,
  setSegmentIndexLocked,
  // set
  getSegmentIndexLockedForSegmentation,
  setSegmentIndexLockedForSegmentation,
  getSegmentsLockedForSegmentation,
}
