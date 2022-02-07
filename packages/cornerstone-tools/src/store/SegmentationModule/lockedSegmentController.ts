import { getGlobalStateForLabelmapUID } from './state'

import { getLabelmapUIDForElement } from './utils'

/**
 * Returns the lock status of the segment index for the element's labelmapIndex-th labelmap.
 * If no labelmapIndex is provided it uses the active labelmap
 * @param element HTML element
 * @param segmentIndex segment Index
 * @param labelmapIndex? labelmap Index
 * @returns
 */
function getSegmentIndexLockedStatusForElement(
  element: HTMLElement,
  segmentIndex: number,
  labelmapIndex?: number
): boolean {
  const labelmapUID = getLabelmapUIDForElement(element, labelmapIndex)
  const labelmapGlobalState = getGlobalStateForLabelmapUID(labelmapUID)

  if (!labelmapGlobalState) {
    return false
  }

  return labelmapGlobalState.segmentsLocked.has(segmentIndex)
}

/**
 * Returns the locked segments for the element's labelmapIndex-th labelmap
 * If no labelmapIndex is provided it uses the active labelmap
 *
 * @param element HTML element
 * @param labelmapIndex labelmap Index
 * @returns
 */
function getLockedSegmentsForElement(
  element: HTMLElement,
  labelmapIndex?: number
): number[] {
  const labelmapUID = getLabelmapUIDForElement(element, labelmapIndex)
  const labelmapGlobalState = getGlobalStateForLabelmapUID(labelmapUID)
  return Array.from(labelmapGlobalState.segmentsLocked)
}

/**
 * Toggles the locked status of segments for the element's labelmapIndex-th labelmap
 * If no labelmapIndex is provided it uses the active labelmap
 * @param element HTML element
 * @param segmentIndex segment index
 * @param labelmapIndex labelmap index
 * @returns
 */
function toggleSegmentIndexLockedForElement(
  element: HTMLElement,
  segmentIndex: number,
  labelmapIndex?: number
): void {
  const labelmapUID = getLabelmapUIDForElement(element, labelmapIndex)
  const lockedStatus = getSegmentIndexLockedStatusForElement(
    element,
    segmentIndex,
    labelmapIndex
  )

  const labelmapGlobalState = getGlobalStateForLabelmapUID(labelmapUID)

  const toggledStatus = !lockedStatus

  if (toggledStatus === true) {
    labelmapGlobalState.segmentsLocked.add(segmentIndex)
    return
  }

  labelmapGlobalState.segmentsLocked.delete(segmentIndex)
}

/**
 * Toggles the locked status of segments for labelmapUID
 * @param labelmapUID labelmap volumeUID
 * @param segmentIndex segment index
 * @returns
 */
function toggleSegmentIndexLockedForLabelmapUID(
  labelmapUID: string,
  segmentIndex: number
): void {
  if (!labelmapUID) {
    throw new Error('LabelmapUID should be provided')
  }

  const { segmentsLocked } = getGlobalStateForLabelmapUID(labelmapUID)
  if (segmentsLocked.has(segmentIndex)) {
    segmentsLocked.delete(segmentIndex)
  } else {
    segmentsLocked.add(segmentIndex)
  }
}

/**
 * Returns an array of locked segment indices for the provided labelmapUID
 * @param labelmapUID Labelmap volumeUID
 * @returns
 */
function getLockedSegmentsForLabelmapUID(labelmapUID: string): number[] {
  const { segmentsLocked } = getGlobalStateForLabelmapUID(labelmapUID)
  return Array.from(segmentsLocked)
}

// lockedSegmentController
export {
  // get
  getLockedSegmentsForLabelmapUID,
  getLockedSegmentsForElement,
  // toggling lock
  toggleSegmentIndexLockedForLabelmapUID,
  toggleSegmentIndexLockedForElement,
  //
  getSegmentIndexLockedStatusForElement,
}

export default {
  // get
  getLockedSegmentsForLabelmapUID,
  getLockedSegmentsForElement,
  // toggling lock
  toggleSegmentIndexLockedForLabelmapUID,
  toggleSegmentIndexLockedForElement,
  //
  getSegmentIndexLockedStatusForElement,
}
