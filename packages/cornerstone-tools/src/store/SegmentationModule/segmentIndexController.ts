import { getEnabledElement } from '@ohif/cornerstone-render'

import state, {
  getActiveLabelmapState,
  getGlobalStateForLabelmapUID,
} from './state'
import { getActiveLabelmapUID } from './activeLabelmapController'

/**
 * Returns the index of the active Segment for the current active labelmap
 *
 * @param  {HTMLElement} element HTML element
 * @returns {number} The active segment index
 */
function getActiveSegmentIndex(element: HTMLElement): number | undefined {
  const viewportLabelmapState = getActiveLabelmapState(element)

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
 * Returns the active segment index for the element based on the labelmapUID it renders
 * @param element HTML element
 * @param labelmapUID volumeUID of the labelmap
 * @returns
 */
function getActiveSegmentIndexForLabelmapUID(labelmapUID: string): number {
  const activeLabelmapGlobalState = getGlobalStateForLabelmapUID(labelmapUID)
  return activeLabelmapGlobalState.activeSegmentIndex
}

/**
 * Sets the active `segmentIndex` for the active labelmap of the HTML element
 *
 *
 * @param  {HTMLElement} element  HTML Element
 * @param  {number} segmentIndex = 1 SegmentIndex
 * @returns {string}
 */
function setActiveSegmentIndex(
  element: HTMLElement,
  segmentIndex = 1
): Promise<string> {
  const enabledElement = getEnabledElement(element)

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
  const activeLabelmapUID = getActiveLabelmapUID(element)

  const labelmapGlobalState = getGlobalStateForLabelmapUID(activeLabelmapUID)

  if (labelmapGlobalState) {
    labelmapGlobalState.activeSegmentIndex = segmentIndex
  }
}

// segmentIndexController
export {
  // get
  getActiveSegmentIndex,
  getActiveSegmentIndexForLabelmapUID,
  // set
  setActiveSegmentIndex,
}

export default {
  // get
  getActiveSegmentIndex,
  getActiveSegmentIndexForLabelmapUID,
  // set
  setActiveSegmentIndex,
}
