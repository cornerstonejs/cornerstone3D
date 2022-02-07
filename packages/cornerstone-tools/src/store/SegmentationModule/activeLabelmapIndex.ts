import { getEnabledElement } from '@ohif/cornerstone-render'

import state from './state'
import { addNewLabelmap, getNextLabelmapIndex } from './addNewLabelmap'

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

  let index = labelmapIndex
  if (!labelmapIndex) {
    index = getNextLabelmapIndex(canvas)
  }

  const options = {
    volumeUID: `labelmap-${index}`,
  }
  // Put the current volume as a reference for the labelmap
  const labelmapUID = await addNewLabelmap({
    canvas,
    labelmapIndex,
    options,
  })

  return labelmapUID
}

export { getActiveLabelmapIndex, setActiveLabelmapIndex }
