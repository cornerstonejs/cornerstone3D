import vtkColorTransferFunction from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction'
import vtkPiecewiseFunction from 'vtk.js/Sources/Common/DataModel/PiecewiseFunction'

import { getEnabledElement, StackViewport } from '@ohif/cornerstone-render'

import state from './state'
import { getSegmentationConfig } from './segmentationConfig'
import setLabelmapColorAndOpacity from './setLabelmapColorAndOpacity'

/**
 * It renders a labelmap 3D volume into the scene the canvas is associated with.
 * @param {canvas, labelmap, callback, labelmapIndex, immediateRender}
 */
async function setLabelmapForElement({
  canvas,
  labelmap,
  labelmapIndex = 0,
  colorLUTIndex = 0,
  immediateRender = false,
}) {
  const enabledElement = getEnabledElement(canvas)
  const { scene, viewportUID, viewport } = enabledElement

  // Segmentation VolumeUID
  const { uid: labelmapUID } = labelmap

  // StackViewport Implementation
  if (viewport instanceof StackViewport) {
    throw new Error('Segmentation for StackViewport is not supported yet')
  }

  // VolumeViewport Implementation
  let viewportSegState = state.volumeViewports[viewportUID]

  // If first time with this state
  if (!viewportSegState) {
    // If no state is assigned for the viewport for segmentation: create an empty
    // segState for the viewport and assign the requested labelmapIndex as the active one.
    viewportSegState = {
      activeLabelmapIndex: labelmapIndex,
      labelmaps: [],
    }
    state.volumeViewports[viewportUID] = viewportSegState
  }

  // Updating the active labelmapIndex
  state.volumeViewports[viewportUID].activeLabelmapIndex = labelmapIndex

  // Adding the new labelmap state
  let labelmapState = viewportSegState.labelmaps[labelmapIndex]
  if (!labelmapState) {
    labelmapState = {
      volumeUID: labelmapUID,
      activeSegmentIndex: 0,
      segmentsHidden: [],
      cfun: vtkColorTransferFunction.newInstance(),
      ofun: vtkPiecewiseFunction.newInstance(),
    }
    viewportSegState.labelmaps[labelmapIndex] = labelmapState
  }

  // Whether to render inactive maps or not?
  const config = getSegmentationConfig()
  let visibility = true
  if (!config.renderInactiveLabelmaps) {
    // Check if the current the labelmapIndex is the activeLabelmapIndex?
    if (viewportSegState.activeLabelmapIndex !== labelmapIndex) {
      visibility = false
    }
  }

  const { cfun, ofun } = labelmapState

  // Add labelmap volumes to the scene to be be rendered
  await scene.addVolumes(
    [
      {
        volumeUID: labelmapUID,
        callback: ({ volumeActor }) => {
          setLabelmapColorAndOpacity(volumeActor, cfun, ofun, colorLUTIndex)
        },
        visibility,
      },
    ],
    immediateRender
  )

  // Todo: Trigger label map modified
}

export default setLabelmapForElement
