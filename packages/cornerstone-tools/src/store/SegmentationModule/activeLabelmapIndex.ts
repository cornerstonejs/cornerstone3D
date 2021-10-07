import { getEnabledElement } from '@ohif/cornerstone-render'

import state, { getLabelmapsStateForElement } from './state'
import { addNewLabelmap } from './addNewLabelmap'
import { triggerLabelmapsUpdated } from './utils'

/**
 * Returns the index of the active `Labelmap3D`.
 *
 * @param  {HTMLElement} canvas HTML canvas
 * @returns {number} The index of the active `Labelmap3D`.
 */
function getActiveLabelmapIndex(canvas: HTMLCanvasElement): number {
  const viewportLabelmapsState = getLabelmapsStateForElement(canvas)

  if (!viewportLabelmapsState) {
    return
  }

  return viewportLabelmapsState.activeLabelmapIndex
}

/**
 * Returns the next labelmap Index that can be set on the canvas. It checks
 * all the available labelmaps for the element, and increases that number by 1
 * or return 0 if no labelmap is provided
 * @param canvas HTMLCanvasElement
 * @returns next LabelmapIndex
 */
function getNextLabelmapIndex(canvas: HTMLCanvasElement): number {
  const viewportLabelmapsState = getLabelmapsStateForElement(canvas)

  if (!viewportLabelmapsState) {
    return 0
  }

  // next labelmap index = current length of labelmaps
  return viewportLabelmapsState.labelmaps.length
}

/**
 * Returns the VolumeUID of the active `Labelmap`.
 *
 * @param  {HTMLElement} canvas HTML canvas
 * @returns {number} The index of the active `Labelmap3D`.
 */
function getActiveLabelmapUID(canvas: HTMLCanvasElement): string {
  const viewportLabelmapsState = getLabelmapsStateForElement(canvas)

  if (!viewportLabelmapsState) {
    return
  }

  const { activeLabelmapIndex } = viewportLabelmapsState
  return viewportLabelmapsState.labelmaps[activeLabelmapIndex].volumeUID
}

/**
 * Sets the active `labelmapIndex` for the `BrushStackState` displayed on this
 * element. Creates the corresponding `Labelmap3D` if it doesn't exist.
 *
 * @param  {HTMLElement|string} elementOrEnabledElementUID   The cornerstone enabled
 *                                                    element or its UUID.
 * @param  {number} labelmapIndex = 0 The index of the labelmap.
 * @returns {string} labelmap UID which is the volumeUID of the labelmap which is active now
 */
async function setActiveLabelmapIndex(
  canvas: HTMLCanvasElement,
  labelmapIndex = 0
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
  const viewportLabelmapsState = state.volumeViewports[viewportUID]
  const viewportUIDs = scene.getViewportUIDs()

  // If we have already a labelmap in the state for the provided labelmapIndex
  if (viewportLabelmapsState?.labelmaps[labelmapIndex]) {
    // Update active viewportUID on all scene's viewports
    viewportUIDs.forEach((viewportUID) => {
      state.volumeViewports[viewportUID].activeLabelmapIndex = labelmapIndex
    })

    // Todo: only for the viewports changed
    triggerLabelmapsUpdated()
    return viewportLabelmapsState.labelmaps[labelmapIndex].volumeUID
  }

  // Create a new labelmap at the labelmapIndex, If there is no labelmap at that index

  const options = {
    volumeUID: `${scene.uid}-labelmap-${labelmapIndex}`,
  }
  // Put the current volume as a reference for the labelmap
  const labelmapUID = await addNewLabelmap({
    canvas,
    labelmapIndex,
    options,
  })

  return labelmapUID
}

// this method SHOULD not be used to create a new labelmap
function setActiveLabelmapByLabelmapUID(
  canvas: HTMLCanvasElement,
  labelmapUID: string
): void {
  // volumeViewport
  const viewportLabelmapsState = getLabelmapsStateForElement(canvas)

  if (
    !viewportLabelmapsState ||
    viewportLabelmapsState.labelmaps.length === 0
  ) {
    throw new Error(`No labelmap found for ${canvas}`)
  }

  const labelmapIndex = viewportLabelmapsState.labelmaps.findIndex(
    ({ volumeUID }) => labelmapUID === volumeUID
  )

  if (labelmapIndex === undefined) {
    throw new Error(`No labelmap found with name of ${labelmapUID}`)
  }

  setActiveLabelmapIndex(canvas, labelmapIndex)
}

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
