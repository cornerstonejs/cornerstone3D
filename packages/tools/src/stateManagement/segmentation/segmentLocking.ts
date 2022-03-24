import { getActiveSegmentationInfo } from './activeSegmentation'

import { getGlobalSegmentationDataByUID } from '../../stateManagement/segmentation/segmentationState'
import { triggerSegmentationGlobalStateModified } from './triggerSegmentationEvents'

/**
 * Get the locked status of a segment index in a segmentation
 *
 * @param toolGroupId - The Id of the tool group that contains the
 * segmentation.
 * @param segmentIndex - The index of the segment
 * @returns A boolean value indicating whether the segment is locked or not for modification
 */
// Todo: should this be based on a segmentationUID instead of a toolGroupId?
function getSegmentIndexLocked(
  toolGroupId: string,
  segmentIndex: number
): boolean {
  const activeSegmentationInfo = getActiveSegmentationInfo(toolGroupId)

  if (!activeSegmentationInfo) {
    throw new Error('element does not contain an active segmentation')
  }

  const { volumeId: segmentationUID } = activeSegmentationInfo
  const segmentationGlobalState =
    getGlobalSegmentationDataByUID(segmentationUID)

  const lockedSegments = segmentationGlobalState.segmentsLocked

  return lockedSegments.has(segmentIndex)
}

/**
 * Set the locked status of a segment in a segmentation globally. It fires
 * a global state modified event.
 *
 * @triggers {SegmentationGlobalStateModifiedEvent}
 *
 * @param toolGroupId - the UID of the tool group that contains the
 * segmentation
 * @param segmentIndex - the index of the segment to lock/unlock
 * @param locked - boolean
 */
// Todo: shouldn't this be a based on a segmentationUID instead of a toolGroupId?
function setSegmentIndexLocked(
  toolGroupId: string,
  segmentIndex: number,
  locked = true
): void {
  const activeSegmentationInfo = getActiveSegmentationInfo(toolGroupId)

  if (!activeSegmentationInfo) {
    throw new Error('element does not contain an active segmentation')
  }

  const { volumeId: segmentationUID } = activeSegmentationInfo

  const segmentationGlobalState =
    getGlobalSegmentationDataByUID(segmentationUID)

  const { segmentsLocked } = segmentationGlobalState

  if (locked) {
    segmentsLocked.add(segmentIndex)
  } else {
    segmentsLocked.delete(segmentIndex)
  }

  triggerSegmentationGlobalStateModified(segmentationUID)
}

/**
 * Get the locked status for a segment index in a segmentation
 * @param segmentationUID - The UID of the segmentation that the segment
 * belongs to.
 * @param segmentIndex - The index of the segment
 * @returns A boolean value indicating whether the segment is locked or not.
 */
function getSegmentIndexLockedForSegmentation(
  segmentationUID: string,
  segmentIndex: number
): boolean {
  const globalState = getGlobalSegmentationDataByUID(segmentationUID)

  if (!globalState) {
    throw new Error(`No segmentation state found for ${segmentationUID}`)
  }

  const { segmentsLocked } = globalState
  return segmentsLocked.has(segmentIndex)
}

/**
 * Set the locked status of a segment index in a segmentation
 * @param segmentationUID - The UID of the segmentation whose segment
 * index is being modified.
 * @param segmentIndex - The index of the segment to lock/unlock.
 */
function setSegmentIndexLockedForSegmentation(
  segmentationUID: string,
  segmentIndex: number,
  locked = true
): void {
  const segmentationGlobalState =
    getGlobalSegmentationDataByUID(segmentationUID)

  if (!segmentationGlobalState) {
    throw new Error(`No segmentation state found for ${segmentationUID}`)
  }

  const { segmentsLocked } = segmentationGlobalState

  if (locked) {
    segmentsLocked.add(segmentIndex)
  } else {
    segmentsLocked.delete(segmentIndex)
  }

  triggerSegmentationGlobalStateModified(segmentationUID)
}

/**
 * Get the locked segments for a segmentation
 * @param segmentationUID - The UID of the segmentation to get locked
 * segments for.
 * @returns An array of locked segment indices.
 */
function getSegmentsLockedForSegmentation(
  segmentationUID: string
): number[] | [] {
  const globalState = getGlobalSegmentationDataByUID(segmentationUID)

  if (!globalState) {
    throw new Error(`No segmentation state found for ${segmentationUID}`)
  }

  const { segmentsLocked } = globalState
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

export default {
  // toolGroup active segmentation
  getSegmentIndexLocked,
  setSegmentIndexLocked,
  // set
  getSegmentIndexLockedForSegmentation,
  setSegmentIndexLockedForSegmentation,
  getSegmentsLockedForSegmentation,
}
