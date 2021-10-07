import {
  getEnabledElement,
  StackViewport,
  triggerEvent,
} from '@ohif/cornerstone-render'

import state, {
  getGlobalStateForLabelmapUID,
  setLabelmapGlobalState,
  setLabelmapViewportSpecificState,
} from './state'
import setLabelmapColorAndOpacity from './setLabelmapColorAndOpacity'
import { CornerstoneTools3DEvents as EVENTS } from '../../enums'

type LabelmapEvent = {
  canvas: HTMLCanvasElement
  labelmapUID: string
  labelmapIndex: number
  renderingEngineUID: string
  sceneUID: string
  viewportUID: string
}

// function getActiveLabelmapForElement(canvas) {
//   const activeLabelmapIndex = getActiveLabelmapIndex(canvas)
//   return getLabelmapForElement(canvas, activeLabelmapIndex)
// }

// function getLabelmapForElement(canvas, labelmapIndex) {
//   const { viewportUID } = getEnabledElement(canvas)

//   const { volumeUID } =
//     state.volumeViewports[viewportUID].labelmaps[labelmapIndex]
//   return cache.getVolume(volumeUID)
// }

/**
 * It renders a labelmap 3D volume into the scene the canvas is associated with.
 * @param {canvas, labelmap, callback, labelmapIndex, immediateRender}
 */
async function setLabelmapForElement({
  canvas,
  labelmap,
  labelmapIndex = 0,
  colorLUTIndex = 0,
  labelmapViewportState,
}) {
  const enabledElement = getEnabledElement(canvas)
  const { scene, viewportUID, viewport, renderingEngineUID, sceneUID } =
    enabledElement

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

  // Updating viewport-specific labelmap states
  scene.getViewportUIDs().forEach((viewportUID) => {
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

    setLabelmapViewportSpecificState(
      viewportUID,
      labelmapUID,
      labelmapIndex,
      labelmapViewportState
    )
  })

  const viewportLabelmapsState = state.volumeViewports[viewportUID]
  const viewportLabelmapState = viewportLabelmapsState.labelmaps[labelmapIndex]

  const { cfun, ofun, labelmapConfig } = viewportLabelmapState

  // Default to true since we are setting a new labelmap, however,
  // in the event listener, we will make other segmentations visible/invisible
  //  based on the config
  const visibility = true

  // Add labelmap volumes to the scene to be be rendered, but not force the render
  await scene.addVolumes([
    {
      volumeUID: labelmapUID,
      callback: ({ volumeActor }) => {
        setLabelmapColorAndOpacity(
          volumeActor,
          cfun,
          ofun,
          colorLUTIndex,
          labelmapConfig,
          true // isActiveLabelmap
        )
      },
      visibility,
    },
  ])

  const eventData: LabelmapEvent = {
    canvas,
    labelmapUID,
    labelmapIndex,
    renderingEngineUID,
    sceneUID,
    viewportUID,
  }

  triggerEvent(canvas, EVENTS.LABELMAP_UPDATED, eventData)
}

export default setLabelmapForElement

export {
  // getActiveLabelmapForElement,
  // getLabelmapForElement,
  setLabelmapForElement,
}
