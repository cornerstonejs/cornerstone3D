import { VIEWPORT_IDS } from '../constants'
import { Enums, CONSTANTS } from '@cornerstonejs/core'
import {
  setCTWWWC,
  setCTVRTransferFunction,
} from '../helpers/transferFunctionHelpers'

const { ViewportType } = Enums
const { ORIENTATION } = CONSTANTS

function setLayout(
  renderingEngine,
  canvasContainers,
  { ctSceneToolGroup, ctVRSceneToolGroup }
) {
  const viewportInput = [
    // CT
    {
      viewportId: VIEWPORT_IDS.CT.AXIAL,
      type: ViewportType.ORTHOGRAPHIC,
      canvas: canvasContainers.get(0),
      defaultOptions: {
        orientation: ORIENTATION.AXIAL,
      },
    },
    {
      viewportId: VIEWPORT_IDS.CT.SAGITTAL,
      type: ViewportType.ORTHOGRAPHIC,
      canvas: canvasContainers.get(1),
      defaultOptions: {
        orientation: ORIENTATION.SAGITTAL,
      },
    },
    {
      viewportId: VIEWPORT_IDS.CT.CORONAL,
      type: ViewportType.ORTHOGRAPHIC,
      canvas: canvasContainers.get(2),
      defaultOptions: {
        orientation: ORIENTATION.CORONAL,
      },
    },
    {
      viewportId: VIEWPORT_IDS.CTVR.VR,
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

  const renderingEngineId = renderingEngine.uid

  viewportInput.forEach((viewportInputEntry) => {
    const { sceneUID, viewportId } = viewportInputEntry

    if (sceneUID === SCENE_IDS.CT) {
      console.log(`adding ${viewportId} to CT toolgroup`)
      ctSceneToolGroup.addViewport(viewportId, renderingEngineId)
    } else if (sceneUID === SCENE_IDS.CTVR) {
      console.log(`adding ${viewportId} to CTVR toolgroup`)
      ctVRSceneToolGroup.addViewport(viewportId, renderingEngineId)
    }
  })
}

function setVolumes(renderingEngine, ctVolumeId) {
  const ctScene = renderingEngine.getScene(SCENE_IDS.CT)
  const ctVRScene = renderingEngine.getScene(SCENE_IDS.CTVR)

  ctScene.setVolumes([{ volumeId: ctVolumeId, callback: setCTWWWC }])
  ctVRScene.setVolumes([
    { volumeId: ctVolumeId, callback: setCTVRTransferFunction },
  ])
}

export default { setLayout, setVolumes }
