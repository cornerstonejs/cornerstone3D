import vtkColorTransferFunction from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction'
import vtkPiecewiseFunction from 'vtk.js/Sources/Common/DataModel/PiecewiseFunction'

import {
  getEnabledElement,
  Scene,
  StackViewport,
  triggerEvent,
  cache,
} from '@ohif/cornerstone-render'

import state from './state'
import setLabelmapColorAndOpacity from './setLabelmapColorAndOpacity'
import { CornerstoneTools3DEvents as EVENTS } from '../../enums'

import { getActiveLabelmapIndex } from './activeLabelmapIndex'

type LabelmapEvent = {
  canvas: HTMLCanvasElement
  labelmapUID: string
  labelmapIndex: number
  renderingEngineUID: string
  sceneUID: string
  viewportUID: string
  scene: Scene
}

function getActiveLabelmapForElement(canvas) {
  const activeLabelmapIndex = getActiveLabelmapIndex(canvas)
  return getLabelmapForElement(canvas, activeLabelmapIndex)
}

function getLabelmapForElement(canvas, labelmapIndex) {
  const { viewportUID } = getEnabledElement(canvas)

  const { volumeUID } =
    state.volumeViewports[viewportUID].labelmaps[labelmapIndex]
  return cache.getVolume(volumeUID)
}

/**
 * It renders a labelmap 3D volume into the scene the canvas is associated with.
 * @param {canvas, labelmap, callback, labelmapIndex, immediateRender}
 */
async function setLabelmapForElement({
  canvas,
  labelmap,
  labelmapIndex = 0,
  colorLUTIndex = 0,
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

  // VolumeViewport Implementation
  const viewportUIDs = scene.getViewportUIDs()

  // Updating segmentation state for viewports
  updateStateForVolumeViewports(viewportUIDs, labelmapIndex, labelmapUID)

  const labelmapState =
    state.volumeViewports[viewportUID].labelmaps[labelmapIndex]
  const { cfun, ofun } = labelmapState

  // Default to true since we are setting a new labelmap, however,
  // in the event listener, we will make other segmentations visible/invisible
  //  based on the config
  const visibility = true

  // Add labelmap volumes to the scene to be be rendered, but not force the render
  await scene.addVolumes([
    {
      volumeUID: labelmapUID,
      callback: ({ volumeActor }) => {
        setLabelmapColorAndOpacity(volumeActor, cfun, ofun, colorLUTIndex)
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
    scene,
  }

  triggerEvent(canvas, EVENTS.LABELMAP_MODIFIED, eventData)
}

/**
 * Updates the segmentation state with the new labelmapIndex, and labelmapUID
 * for the scene's volume viewports. It will initialize states if empty.
 * @param viewportsUIDs scene's volumeViewport UIDs
 * @param labelmapIndex labelmapIndex
 * @param labelmapUID labelmapUID
 */
function updateStateForVolumeViewports(
  viewportsUIDs,
  labelmapIndex,
  labelmapUID
) {
  viewportsUIDs.forEach((viewportUID) => {
    let viewportState = state.volumeViewports[viewportUID]

    // If first time with this state
    if (!viewportState) {
      // If no state is assigned for the viewport for segmentation: create an empty
      // segState for the viewport and assign the requested labelmapIndex as the active one.
      viewportState = {
        activeLabelmapIndex: labelmapIndex,
        labelmaps: [],
      }
      state.volumeViewports[viewportUID] = viewportState
    }

    // Updating the active labelmapIndex
    state.volumeViewports[viewportUID].activeLabelmapIndex = labelmapIndex

    // Overwriting the new labelmap state
    viewportState.labelmaps[labelmapIndex] = {
      volumeUID: labelmapUID,
      activeSegmentIndex: 1,
      colorLUTIndex: 0,
      segmentsHidden: [],
      cfun: vtkColorTransferFunction.newInstance(),
      ofun: vtkPiecewiseFunction.newInstance(),
    }
  })
}

export default setLabelmapForElement

export {
  getActiveLabelmapForElement,
  getLabelmapForElement,
  setLabelmapForElement,
}
