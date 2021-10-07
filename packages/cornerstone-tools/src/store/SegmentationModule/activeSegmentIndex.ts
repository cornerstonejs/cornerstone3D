import { getEnabledElement } from '@ohif/cornerstone-render'

import state, {
  getActiveLabelmapState,
  getGlobalStateForLabelmapUID,
} from './state'
import { getActiveLabelmapUID } from './activeLabelmapIndex'

/**
 * Returns the index of the active Segment for the current active labelmap
 *
 * @param  {HTMLElement} canvas HTML canvas
 * @returns {number} The active segment index
 */
function getActiveSegmentIndex(canvas: HTMLCanvasElement): number | undefined {
  const viewportLabelmapState = getActiveLabelmapState(canvas)

  if (!viewportLabelmapState) {
    // Todo: check this
    return 1
  }

  const activeLabelmapGlobalState = getGlobalStateForLabelmapUID(
    viewportLabelmapState.volumeUID
  )

  if (activeLabelmapGlobalState) {
    return activeLabelmapGlobalState.activeSegmentIndex
  }
}

/**
 * Returns the active segment index for the canvas based on the labelmapUID it renders
 * @param canvas HTML Canvas
 * @param labelmapUID volumeUID of the labelmap
 * @returns
 */
function getActiveSegmentIndexForLabelmapUID(labelmapUID: string): number {
  const activeLabelmapGlobalState = getGlobalStateForLabelmapUID(labelmapUID)
  return activeLabelmapGlobalState.activeSegmentIndex
}

/**
 * Sets the active `segmentIndex` for the active labelmap of the canvas element
 *
 *
 * @param  {HTMLElement} canvas  HTML Element
 * @param  {number} segmentIndex = 1 SegmentIndex
 * @returns {string}
 */
function setActiveSegmentIndex(
  canvas: HTMLCanvasElement,
  segmentIndex = 1
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
  // Todo: should this initialize the state when no labelmaps? I don't think so
  if (!state.volumeViewports[viewportUID]) {
    throw new Error(
      'Canvas does not contain an active labelmap, create one first before setting the segment Index'
    )
  }

  // active labelmap Index is the same for all viewports in the scene
  const activeLabelmapUID = getActiveLabelmapUID(canvas)

  const labelmapGlobalState = getGlobalStateForLabelmapUID(activeLabelmapUID)

  if (labelmapGlobalState) {
    labelmapGlobalState.activeSegmentIndex = segmentIndex
  }
}

export {
  // get
  getActiveSegmentIndex,
  getActiveSegmentIndexForLabelmapUID,
  // set
  setActiveSegmentIndex,
}
