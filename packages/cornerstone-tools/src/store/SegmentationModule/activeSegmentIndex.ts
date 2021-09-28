import { getEnabledElement } from '@ohif/cornerstone-render'

import state from './state'
import { getActiveLabelmapIndex } from '.'

/**
 * Returns the index of the active Segment for the current active labelmap
 *
 * @param  {HTMLElement} canvas HTML canvas
 * @returns {number} The active segment index
 */
function getActiveSegmentIndex(canvas: HTMLCanvasElement): number {
  const enabledElement = getEnabledElement(canvas)

  if (!enabledElement) {
    return
  }

  const activeLabelmapIndex = getActiveLabelmapIndex(canvas)
  if (activeLabelmapIndex === undefined) {
    console.warn('No active labelmap detected')
    return
  }

  const { scene, viewportUID } = enabledElement

  // stackViewport
  if (!scene) {
    throw new Error('Segmentation for StackViewport is not supported yet')
  }

  // volumeViewport
  const viewportSegState = state.volumeViewports[viewportUID]

  if (!viewportSegState) {
    return
  }

  return viewportSegState.labelmaps[activeLabelmapIndex].activeSegmentIndex
}

/**
 * Sets the active `segmentIndex` for the labelmap on the element.
 *
 *
 * @param  {HTMLElement|string} elementOrEnabledElementUID   The cornerstone enabled
 *                                                    element or its UUID.
 * @param  {number} labelmapIndex = 0 The index of the labelmap.
 * @returns {string} labelmap UID which is the volumeUID of the labelmap which is active now
 */
function setActiveSegmentIndex(
  canvas: HTMLCanvasElement,
  segmentIndex = 0
): Promise<string> {
  const enabledElement = getEnabledElement(canvas)

  if (!enabledElement) {
    return
  }

  const { scene, viewportUID } = enabledElement

  // stackViewport
  if (!scene) {
    throw new Error('Segmentation for StackViewport is not supported yet')
  }

  // volumeViewport
  const viewportSegState = state.volumeViewports[viewportUID]

  // Todo: should this initialize the state when no labelmaps? I don't think so
  if (!viewportSegState) {
    throw new Error(
      'Canvas does not contain an active labelmap, create one first before setting the segment Index'
    )
  }

  const activeLabelmapIndex = getActiveLabelmapIndex(canvas)
  const activeLabelmap = viewportSegState.labelmaps[activeLabelmapIndex]
  if (!activeLabelmap) {
    throw new Error(
      'Canvas does not contain an active labelmap, create one first before setting the segment Index'
    )
  }
  activeLabelmap.activeSegmentIndex = segmentIndex
}

export { getActiveSegmentIndex, setActiveSegmentIndex }
