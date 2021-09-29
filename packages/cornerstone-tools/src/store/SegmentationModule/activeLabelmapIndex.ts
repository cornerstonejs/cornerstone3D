import { getEnabledElement } from '@ohif/cornerstone-render'

import state from './state'
import { addNewLabelmap } from './addNewLabelmap'
import { triggerLabelmapsUpdated } from './utils'

/**
 * Returns the index of the active `Labelmap3D`.
 *
 * @param  {HTMLElement} canvas HTML canvas
 * @returns {number} The index of the active `Labelmap3D`.
 */
function getActiveLabelmapIndex(canvas: HTMLCanvasElement): number {
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

  if (!viewportSegState) {
    return
  }

  return viewportSegState.activeLabelmapIndex
}

/**
 * Returns the VolumeUID of the active `Labelmap`.
 *
 * @param  {HTMLElement} canvas HTML canvas
 * @returns {number} The index of the active `Labelmap3D`.
 */
function getActiveLabelmapUID(canvas: HTMLCanvasElement): string {
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

  if (!viewportSegState) {
    return
  }

  const { activeLabelmapIndex } = viewportSegState

  return viewportSegState.labelmaps[activeLabelmapIndex].volumeUID
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
  const viewportSegState = state.volumeViewports[viewportUID]
  const viewportUIDs = scene.getViewportUIDs()

  // If we have already a labelmap in the state for the provided labelmapIndex
  if (viewportSegState?.labelmaps[labelmapIndex]) {
    // Update active viewportUID on all scene's viewports
    viewportUIDs.forEach((viewportUID) => {
      state.volumeViewports[viewportUID].activeLabelmapIndex = labelmapIndex
    })
    // Todo: only for the viewports changed
    triggerLabelmapsUpdated()
    return viewportSegState.labelmaps[labelmapIndex].volumeUID
  }

  // Todo: do we need this? it should be set to the value of the labelmapIndex
  const index = labelmapIndex
  // if (!labelmapIndex) {
  //   index = getNextLabelmapIndex(canvas)
  // }

  const options = {
    volumeUID: `${scene.uid}-labelmap-${index}`,
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

  if (!viewportSegState || viewportSegState.labelmaps.length === 0) {
    throw new Error(`No labelmap found for ${viewportUID}`)
  }

  const labelmapIndex = viewportSegState.labelmaps.findIndex(
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
}
