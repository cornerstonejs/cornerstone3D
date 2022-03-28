import { getActiveSegmentationRepresentation } from './activeSegmentation'
import { getSegmentation } from './segmentationState'
import { triggerSegmentationModified } from './triggerSegmentationEvents'

/**
 * Returns the active segment index for the active segmentation representation in the tool group
 *
 * @param toolGroupId - The Id of the tool group that contains an active segmentation representation.
 * @returns The active segment index.
 */
function getActiveSegmentIndex(toolGroupId: string): number | undefined {
  const segmentationRepresentation =
    getActiveSegmentationRepresentation(toolGroupId)

  if (!segmentationRepresentation) {
    throw new Error('toolGroup does not contain an active segmentation')
  }

  const { segmentationId } = segmentationRepresentation
  const segmentation = getSegmentation(segmentationId)

  if (segmentation) {
    return segmentation.activeSegmentIndex
  }
}

/**
 * Set the active segment index for the active segmentation of the toolGroup.
 * It fires a global state modified event.
 *
 * @triggers SEGMENTATION_MODIFIED
 * @param toolGroupId - The Id of the tool group that contains the segmentation.
 * @param segmentIndex - The index of the segment to be activated.
 */
function setActiveSegmentIndex(
  toolGroupId: string,
  segmentIndex: number
): void {
  const segmentationRepresentation =
    getActiveSegmentationRepresentation(toolGroupId)

  if (!segmentationRepresentation) {
    throw new Error('element does not contain an active segmentation')
  }

  const { segmentationId } = segmentationRepresentation
  const segmentation = getSegmentation(segmentationId)

  if (segmentation?.activeSegmentIndex !== segmentIndex) {
    segmentation.activeSegmentIndex = segmentIndex

    triggerSegmentationModified(segmentationId)
  }
}

/**
 * Set the active segment index for a segmentation Id. It fires a global state
 * modified event.
 *
 * @triggers SEGMENTATION_MODIFIED
 * @param segmentationId - The id of the segmentation that the segment belongs to.
 * @param segmentIndex - The index of the segment to be activated.
 */
function setActiveSegmentIndexForSegmentation(
  segmentationId: string,
  segmentIndex: number
): void {
  const segmentation = getSegmentation(segmentationId)

  if (segmentation?.activeSegmentIndex !== segmentIndex) {
    segmentation.activeSegmentIndex = segmentIndex

    triggerSegmentationModified(segmentationId)
  }
}

/**
 * Get the active segment index for a segmentation in the global state
 * @param segmentationId - The id of the segmentation to get the active segment index from.
 * @returns The active segment index for the given segmentation.
 */
function getActiveSegmentIndexForSegmentation(
  segmentationId: string
): number | undefined {
  const segmentation = getSegmentation(segmentationId)

  if (segmentation) {
    return segmentation.activeSegmentIndex
  }
}

export {
  // toolGroup Active Segmentation
  getActiveSegmentIndex,
  setActiveSegmentIndex,
  // global segmentation
  getActiveSegmentIndexForSegmentation,
  setActiveSegmentIndexForSegmentation,
}
