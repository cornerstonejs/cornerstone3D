import { getEnabledElement, StackViewport } from '@ohif/cornerstone-render'

import state, {
  getGlobalStateForLabelmapUID,
  setLabelmapGlobalState,
  setLabelmapViewportSpecificState,
} from './state'
import { triggerLabelmapStateUpdated } from './triggerLabelmapsStateUpdated'

/**
 * It renders a labelmap 3D volume into the scene that the element belongs to
 * @param {element, labelmap, callback, labelmapIndex, immediateRender}
 */
async function setLabelmapForElement({
  element,
  labelmap,
  labelmapIndex = 0,
  colorLUTIndex = 0,
  labelmapViewportState,
}) {
  const enabledElement = getEnabledElement(element)
  const { scene, viewportUID, viewport } = enabledElement

  // Segmentation VolumeUID
  const { uid: labelmapUID } = labelmap

  // StackViewport Implementation
  if (viewport instanceof StackViewport) {
    throw new Error('Segmentation for StackViewport is not supported yet')
  }

  // Updating segmentation state for viewports
  // Creating a global state for labelmap if not found
  const labelmapGlobalState = getGlobalStateForLabelmapUID(labelmapUID)
  if (!labelmapGlobalState) {
    setLabelmapGlobalState(labelmapUID)
  }

  const viewportUIDs = scene.getViewportUIDs()

  // Updating viewport-specific labelmap states
  viewportUIDs.forEach((viewportUID) => {
    // VolumeViewport Implementation
    let viewportLabelmapsState = state.volumeViewports[viewportUID]

    // If first time with this state
    if (!viewportLabelmapsState) {
      // If no state is assigned for the viewport for segmentation: create an empty
      // segState for the viewport and assign the requested labelmapIndex as the active one.
      viewportLabelmapsState = {
        activeLabelmapIndex: labelmapIndex,
        labelmaps: [],
      }
      state.volumeViewports[viewportUID] = viewportLabelmapsState
    }

    // Updating the active labelmapIndex
    state.volumeViewports[viewportUID].activeLabelmapIndex = labelmapIndex

    setLabelmapViewportSpecificState(viewportUID, labelmapUID, labelmapIndex)
  })

  // Default to true since we are setting a new labelmap, however,
  // in the event listener, we will make other segmentations visible/invisible
  //  based on the config
  const visibility = true

  // Add labelmap volumes to the scene to be be rendered, but not force the render
  await scene.addVolumes([
    {
      volumeUID: labelmapUID,
      visibility,
    },
  ])

  scene.getViewports().forEach(({ element }) => {
    triggerLabelmapStateUpdated(labelmapUID, element)
  })
}

export default setLabelmapForElement

export {
  // getActiveLabelmapForElement,
  // getLabelmapForElement,
  setLabelmapForElement,
}
