import { getEnabledElement } from '@ohif/cornerstone-render'

import state from './state'
import { addNewLabelmap } from './addNewLabelmap'

function getNextLabelmapIndex(canvas) {
  const enabledElement = getEnabledElement(canvas)

  if (!enabledElement) {
    return
  }

  const { viewportUID } = enabledElement

  // VolumeViewport Implementation
  const viewportSegState = state.volumeViewports[viewportUID]

  if (!viewportSegState) {
    return 0
  }

  const numLabelmaps = viewportSegState.labelmaps.filter(
    (labelmapUID) => !!labelmapUID
  ).length

  // next labelmap index = current length of labelmaps
  return numLabelmaps
}

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

  // If we have already a labelmap in the state for the provided labelmapIndex
  if (viewportSegState?.labelmaps[labelmapIndex]) {
    viewportSegState.activeLabelmapIndex = labelmapIndex
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
function setActiveLabelmapIndexByLabelmapUID(
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
  getActiveLabelmapIndex,
  setActiveLabelmapIndex,
  getNextLabelmapIndex,
  setActiveLabelmapIndexByLabelmapUID,
}
