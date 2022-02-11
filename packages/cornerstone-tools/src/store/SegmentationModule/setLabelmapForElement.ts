import {
  getEnabledElement,
  StackViewport,
  addVolumesOnViewports,
} from '@precisionmetrics/cornerstone-render'

import state, {
  getGlobalStateForLabelmapUID,
  setLabelmapGlobalState,
  setLabelmapViewportSpecificState,
} from './state'
import { triggerLabelmapStateUpdated } from './triggerLabelmapStateUpdated'

/**
 * It renders a labelmap 3D volume into the viewport that the element belongs to
 * @param {element, labelmap, callback, labelmapIndex, immediateRender}
 */
async function setLabelmapForElement({
  element,
  labelmap,
  labelmapIndex = 0,
  colorLUTIndex = 0,
}) {
  const enabledElement = getEnabledElement(element)
  const { renderingEngine, viewport } = enabledElement

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

  const { uid: viewportUID } = viewport

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

  // Default to true since we are setting a new labelmap, however,
  // in the event listener, we will make other segmentations visible/invisible
  //  based on the config
  const visibility = true

  // Add labelmap volumes to the viewports to be be rendered, but not force the render
  await addVolumesOnViewports(
    renderingEngine,
    [
      {
        volumeUID: labelmapUID,
        visibility,
      },
    ],
    [viewportUID]
  )

  // Trigger the labelmap state updated event which
  // will trigger the event for all the viewports that have the labelmap
  triggerLabelmapStateUpdated(labelmapUID, element)
}

export default setLabelmapForElement

export { setLabelmapForElement }
