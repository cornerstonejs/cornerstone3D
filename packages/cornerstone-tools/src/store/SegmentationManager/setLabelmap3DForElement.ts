import { getEnabledElement } from '@ohif/cornerstone-render'

import state from './state'

/**
 * It renders a labelmap 3D volume into the scene the canvas is associated with.
 * @param {canvas, labelmap3D, callback, labelmapIndex, immediateRender}
 */
function setLabelmap3DForElement({
  canvas,
  labelmap3D,
  callback,
  labelmapIndex = 0,
  immediateRender = false,
}): void {
  const enabledElement = getEnabledElement(canvas)
  const { scene, sceneUID, viewport } = enabledElement

  //Todo: handle stackViewport segmentations
  if (!sceneUID) {
    throw new Error('Segmentation for StackViewport is not supported yet')
  }

  // Segmentation VolumeUID
  const { uid: segUID } = labelmap3D

  // BackgroundImage
  const { uid: volumeUID } = viewport.getDefaultActor()

  // Todo: should this be based on sceneUID so that we can render segmentations decoupled from the volumes?
  let volumeSegmentState = state.volumes[volumeUID]

  // If first time
  if (!volumeSegmentState) {
    volumeSegmentState = {
      activeLabelmapIndex: 0,
      labelmap3DUID: [],
    }
    state.volumes[volumeUID] = volumeSegmentState
  }

  volumeSegmentState.activeLabelmapIndex = labelmapIndex
  volumeSegmentState.labelmap3DUID.push(segUID)

  scene.setSegmentations(
    [
      {
        volumeUID: segUID,
        callback,
      },
    ],
    immediateRender
  )
}

export default setLabelmap3DForElement
