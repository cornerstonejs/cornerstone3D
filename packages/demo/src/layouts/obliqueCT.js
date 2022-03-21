import { SCENE_IDS, VIEWPORT_IDS } from '../constants'
import { Enums, CONSTANTS } from '@precisionmetrics/cornerstone-render'
import {
  setCTWWWC,
  setCTVRTransferFunction,
} from '../helpers/transferFunctionHelpers'

const { ViewportType } = Enums
const { ORIENTATION } = CONSTANTS

function setLayout(renderingEngine, canvasContainers, { ctObliqueToolGroup }) {
  const viewportInput = [
    // CT
    {
      sceneUID: SCENE_IDS.CTOBLIQUE,
      viewportUID: VIEWPORT_IDS.CTOBLIQUE.OBLIQUE,
      type: ViewportType.ORTHOGRAPHIC,
      canvas: canvasContainers.get(0),
      defaultOptions: {
        orientation: ORIENTATION.CORONAL,
      },
    },
  ]

  renderingEngine.setViewports(viewportInput)

  const renderingEngineUID = renderingEngine.uid
  const viewportInputEntry = viewportInput[0]

  const { sceneUID, viewportUID } = viewportInputEntry

  ctObliqueToolGroup.addViewport(viewportUID, renderingEngineUID)
}

function setVolumes(renderingEngine, ctVolumeUID) {
  const ctObliqueScene = renderingEngine.getScene(SCENE_IDS.CTOBLIQUE)

  ctObliqueScene.setVolumes([{ volumeUID: ctVolumeUID, callback: setCTWWWC }])
}

export default { setLayout, setVolumes }
