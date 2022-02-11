import {
  getEnabledElement,
  VolumeViewport,
} from '@precisionmetrics/cornerstone-render'

import state, { getLabelmapsStateForElement } from './state'
import { triggerLabelmapStateUpdated } from './triggerLabelmapStateUpdated'

/**
 * Returns the index of the active `Labelmap3D`.
 *
 * @param  {HTMLElement} HTML Div element
 * @returns {number} The index of the active `Labelmap3D`.
 */
function getActiveLabelmapIndex(element: HTMLElement): number {
  const viewportLabelmapsState = getLabelmapsStateForElement(element)

  if (!viewportLabelmapsState) {
    return
  }

  return viewportLabelmapsState.activeLabelmapIndex
}

/**
 * Returns the next labelmap Index that can be set on the element. It checks
 * all the available labelmaps for the element, and increases that number by 1
 * or return 0 if no labelmap is provided
 * @param element HTMLElement
 * @returns next LabelmapIndex
 */
function getNextLabelmapIndex(element: HTMLElement): number {
  const viewportLabelmapsState = getLabelmapsStateForElement(element)

  if (!viewportLabelmapsState) {
    return 0
  }

  // next labelmap index = current length of labelmaps
  return viewportLabelmapsState.labelmaps.length
}

/**
 * Returns the VolumeUID of the active `Labelmap`.
 *
 * @param  {HTMLElement} HTML element
 * @returns {number} The index of the active `Labelmap3D`.
 */
function getActiveLabelmapUID(element: HTMLElement): string {
  const viewportLabelmapsState = getLabelmapsStateForElement(element)

  if (!viewportLabelmapsState) {
    return
  }

  const { activeLabelmapIndex } = viewportLabelmapsState
  return viewportLabelmapsState.labelmaps[activeLabelmapIndex].volumeUID
}

/**
 * Sets the active `labelmapIndex` for the labelmaps displayed on this
 * element. Creates the corresponding `Labelmap3D` if it doesn't exist.
 *
 * @param  {HTMLElement} element   HTML Element
 * @param  {number} labelmapIndex = 0 The index of the labelmap.
 * @returns {string} labelmap UID which is the volumeUID of the labelmap which is active now
 */
async function setActiveLabelmapIndex(
  element: HTMLElement,
  labelmapIndex = 0
): Promise<string> {
  const enabledElement = getEnabledElement(element)

  if (!enabledElement) {
    return
  }

  const { viewportUID, viewport } = enabledElement

  if (!(viewport instanceof VolumeViewport)) {
    throw new Error('Segmentation for StackViewport is not supported yet')
  }

  // volumeViewport
  const viewportLabelmapsState = state.volumeViewports[viewportUID]

  // check if the labelmapIndex is valid
  if (!viewportLabelmapsState?.labelmaps[labelmapIndex]) {
    console.warn(
      `No labelmap found for index ${labelmapIndex} on element ${element}`
    )

    return
  }

  // Update active viewportUID on all viewports with the same volume
  state.volumeViewports[viewport.uid].activeLabelmapIndex = labelmapIndex

  const { volumeUID: labelmapUID } =
    viewportLabelmapsState.labelmaps[labelmapIndex]
  triggerLabelmapStateUpdated(labelmapUID, element)
  return viewportLabelmapsState.labelmaps[labelmapIndex].volumeUID
}

// this method SHOULD not be used to create a new labelmap
function setActiveLabelmapByLabelmapUID(
  element: HTMLElement,
  labelmapUID: string
): void {
  // volumeViewport
  const viewportLabelmapsState = getLabelmapsStateForElement(element)

  if (
    !viewportLabelmapsState ||
    viewportLabelmapsState.labelmaps.length === 0
  ) {
    throw new Error(`No labelmap found for ${element}`)
  }

  const labelmapIndex = viewportLabelmapsState.labelmaps.findIndex(
    ({ volumeUID }) => labelmapUID === volumeUID
  )

  if (labelmapIndex === undefined) {
    throw new Error(`No labelmap found with name of ${labelmapUID}`)
  }

  setActiveLabelmapIndex(element, labelmapIndex)
}

// activeLabelmapController
export {
  // get
  getActiveLabelmapIndex,
  getActiveLabelmapUID,
  // set
  setActiveLabelmapIndex,
  setActiveLabelmapByLabelmapUID,
  // utils
  getNextLabelmapIndex,
}

export default {
  // get
  getActiveLabelmapIndex,
  getActiveLabelmapUID,
  // set
  setActiveLabelmapIndex,
  setActiveLabelmapByLabelmapUID,
  // utils
  getNextLabelmapIndex,
}
