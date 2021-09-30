import { getEnabledElement } from '@ohif/cornerstone-render'
import { getActiveLabelmapIndex } from './activeLabelmapIndex'
import state from './state'

/**
 * Update the locked status of the segmentIndex for the viewportUID based
 * on the provided lockedStatus
 * @param viewportUIDs viewportUID
 * @param labelmapIndex labelmapIndex in the viewport state
 * @param segmentIndex segment index
 * @param lockedStatus is locked or not
 */
function updateSegmentIndexLockStatus(
  viewportUIDs,
  labelmapIndex,
  segmentIndex,
  lockedStatus
) {
  viewportUIDs.forEach((viewportUID) => {
    const viewportLabelmaps = state.volumeViewports[viewportUID].labelmaps
    if (lockedStatus === true) {
      viewportLabelmaps[labelmapIndex].segmentsLocked.add(segmentIndex)
    } else {
      viewportLabelmaps[labelmapIndex].segmentsLocked.delete(segmentIndex)
    }
  })
}

/**
 * Set the segmentIndex to be locked of the canvas's labelmap based on its index
 * If no labelmapIndex is provided it uses the active labelmap
 *
 * @param canvas HTML Canvas
 * @param segmentIndex segment index
 * @param labelmapIndex labelmapIndex in the viewport state
 */
function setSegmentIndexLockedForElement(
  canvas: HTMLCanvasElement,
  segmentIndex: number,
  labelmapIndex?: number
): void {
  let index = labelmapIndex
  if (!labelmapIndex) {
    index = getActiveLabelmapIndex(canvas)
  }

  const { sceneUID, scene } = getEnabledElement(canvas)
  if (!sceneUID) {
    throw new Error('Segmentation not implemented for stack viewport yet')
  }

  const viewportUIDs = scene.getViewportUIDs()
  const lockedStatus = true
  updateSegmentIndexLockStatus(viewportUIDs, index, segmentIndex, lockedStatus)
}

/**
 * Set the segmentIndex to be unlocked of the canvas's labelmap based on its index
 * If no labelmapIndex is provided it uses the active labelmap
 *
 * @param canvas HTML Canvas
 * @param segmentIndex segment index
 * @param labelmapIndex labelmapIndex in the viewport state
 */
function setSegmentIndexUnlockedForElement(
  canvas: HTMLCanvasElement,
  segmentIndex: number,
  labelmapIndex?: number
): void {
  let index = labelmapIndex
  if (!labelmapIndex) {
    index = getActiveLabelmapIndex(canvas)
  }

  const { sceneUID, scene } = getEnabledElement(canvas)
  if (!sceneUID) {
    throw new Error('Segmentation not implemented for stack viewport yet')
  }

  const viewportUIDs = scene.getViewportUIDs()
  const lockedStatus = false
  updateSegmentIndexLockStatus(viewportUIDs, index, segmentIndex, lockedStatus)
}

/**
 * Returns the lock status of the segment index for the canvas's labelmapIndex-th labelmap.
 * If no labelmapIndex is provided it uses the active labelmap
 * @param canvas HTML Canvas
 * @param segmentIndex segment Index
 * @param labelmapIndex? labelmap Index
 * @returns
 */
function getSegmentIndexLockedStatusForElement(
  canvas: HTMLCanvasElement,
  segmentIndex: number,
  labelmapIndex?: number
): boolean {
  let index = labelmapIndex
  if (!labelmapIndex) {
    index = getActiveLabelmapIndex(canvas)
  }

  const { sceneUID, viewportUID } = getEnabledElement(canvas)
  if (!sceneUID) {
    throw new Error('Segmentation not implemented for stack viewport yet')
  }

  const viewportState = state.volumeViewports[viewportUID]

  if (!viewportState) {
    return false
  }

  const viewportLabelmaps = viewportState.labelmaps
  return viewportLabelmaps[index].segmentsLocked.has(segmentIndex)
}

/**
 * Returns the locked segments for the canvas's labelmapIndex-th labelmap
 * If no labelmapIndex is provided it uses the active labelmap
 *
 * @param canvas HTML canvas
 * @param labelmapIndex labelmap Index
 * @returns
 */
function getSegmentsLockedForElement(
  canvas: HTMLCanvasElement,
  labelmapIndex?: number
): number[] {
  let index = labelmapIndex
  if (!labelmapIndex) {
    index = getActiveLabelmapIndex(canvas)
  }

  const { sceneUID, viewportUID } = getEnabledElement(canvas)
  if (!sceneUID) {
    throw new Error('Segmentation not implemented for stack viewport yet')
  }

  const viewportLabelmaps = state.volumeViewports[viewportUID].labelmaps
  return Array.from(viewportLabelmaps[index].segmentsLocked)
}

/**
 * Toggles the locked status of segments for the canvas's labelmapIndex-th labelmap
 * If no labelmapIndex is provided it uses the active labelmap
 * @param canvas HTML Canvas
 * @param segmentIndex segment index
 * @param labelmapIndex labelmap index
 * @returns
 */
function toggleSegmentIndexLockedForElement(
  canvas: HTMLCanvasElement,
  segmentIndex: number,
  labelmapIndex?: number
): void {
  const lockedStatus = getSegmentIndexLockedStatusForElement(
    canvas,
    segmentIndex,
    labelmapIndex
  )

  const toggledStatus = !lockedStatus

  if (toggledStatus === true) {
    setSegmentIndexLockedForElement(canvas, segmentIndex, labelmapIndex)
    return
  }

  setSegmentIndexUnlockedForElement(canvas, segmentIndex, labelmapIndex)
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
  // todo: stack viewport

  Object.keys(state.volumeViewports).forEach((viewportUID) => {
    const viewportLabelmaps = state.volumeViewports[viewportUID].labelmaps
    viewportLabelmaps.forEach(({ volumeUID, segmentsLocked }) => {
      if (volumeUID === labelmapUID) {
        if (segmentsLocked.has(segmentIndex)) {
          segmentsLocked.delete(segmentIndex)
        } else {
          segmentsLocked.add(segmentIndex)
        }
      }
    })
  })
}

export {
  // Element-wise locking
  setSegmentIndexLockedForElement,
  setSegmentIndexUnlockedForElement,
  getSegmentsLockedForElement,
  // labelmap-wise locking
  toggleSegmentIndexLockedForLabelmapUID,
  //
  getSegmentIndexLockedStatusForElement,
  toggleSegmentIndexLockedForElement,
}
