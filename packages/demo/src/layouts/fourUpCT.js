import { VIEWPORT_IDS } from '../constants'
import { Enums } from '@precisionmetrics/cornerstone-render'
import {
  setCTWWWC,
  setCTVRTransferFunction,
} from '../helpers/transferFunctionHelpers'

const { ORIENTATION, ViewportType } = Enums

function setLayout(
  renderingEngine,
  canvasContainers,
  { ctSceneToolGroup, ctVRSceneToolGroup }
) {
  const viewportInput = [
    // CT
    {
      viewportUID: VIEWPORT_IDS.CT.AXIAL,
      type: ViewportType.ORTHOGRAPHIC,
      canvas: canvasContainers.get(0),
      defaultOptions: {
        orientation: ORIENTATION.AXIAL,
      },
    },
    {
      viewportUID: VIEWPORT_IDS.CT.SAGITTAL,
      type: ViewportType.ORTHOGRAPHIC,
      canvas: canvasContainers.get(1),
      defaultOptions: {
        orientation: ORIENTATION.SAGITTAL,
      },
    },
    {
      viewportUID: VIEWPORT_IDS.CT.CORONAL,
      type: ViewportType.ORTHOGRAPHIC,
      canvas: canvasContainers.get(2),
      defaultOptions: {
        orientation: ORIENTATION.CORONAL,
      },
    },
    {
      viewportUID: VIEWPORT_IDS.CTVR.VR,
      type: ViewportType.PERSPECTIVE,
      canvas: canvasContainers.get(3),
      defaultOptions: {
        orientation: {
          // Some arbitrary rotation so you can tell its 3D
          sliceNormal: [-0.50000000827545, 0.8660253990066052, 0],
          viewUp: [0, 0, 1],
        },
      },
    },
  ]

  renderingEngine.setViewports(viewportInput)

  const renderingEngineUID = renderingEngine.uid

  viewportInput.forEach((viewportInputEntry) => {
    const { sceneUID, viewportUID } = viewportInputEntry

    if (sceneUID === SCENE_IDS.CT) {
      console.log(`adding ${viewportUID} to CT toolgroup`)
      ctSceneToolGroup.addViewport(viewportUID, renderingEngineUID)
    } else if (sceneUID === SCENE_IDS.CTVR) {
      console.log(`adding ${viewportUID} to CTVR toolgroup`)
      ctVRSceneToolGroup.addViewport(viewportUID, renderingEngineUID)
    }
  })
}

function setVolumes(renderingEngine, ctVolumeUID) {
  const ctScene = renderingEngine.getScene(SCENE_IDS.CT)
  const ctVRScene = renderingEngine.getScene(SCENE_IDS.CTVR)

  ctScene.setVolumes([{ volumeUID: ctVolumeUID, callback: setCTWWWC }])
  ctVRScene.setVolumes([
    { volumeUID: ctVolumeUID, callback: setCTVRTransferFunction },
  ])
}

export default { setLayout, setVolumes }
