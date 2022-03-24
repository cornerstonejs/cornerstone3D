import { SCENE_IDS, VIEWPORT_IDS } from '../constants'
import { Enums, CONSTANTS, utilities, cache } from '@cornerstonejs/core'

const { ViewportType } = Enums
const { ORIENTATION } = CONSTANTS

function setLayout(
  renderingEngine,
  elementContainers,
  { ptTypesSceneToolGroup }
) {
  const viewportInput = [
    // PT Coronal SUV BW
    {
      sceneUID: SCENE_IDS.PT_TYPES_SUV_BW,
      viewportId: VIEWPORT_IDS.PT_TYPES_SUV_BW.CORONAL,
      type: ViewportType.ORTHOGRAPHIC,
      element: elementContainers.get(0),
      defaultOptions: {
        orientation: ORIENTATION.CORONAL,
        background: [1, 1, 1],
      },
    },
    // PT Coronal SUV LBM
    {
      sceneUID: SCENE_IDS.PT_TYPES_SUV_LBM,
      viewportId: VIEWPORT_IDS.PT_TYPES_SUV_LBM.CORONAL,
      type: ViewportType.ORTHOGRAPHIC,
      element: elementContainers.get(1),
      defaultOptions: {
        orientation: ORIENTATION.CORONAL,
        background: [1, 1, 1],
      },
    },
    // PT Coronal SUV BSA
    {
      sceneUID: SCENE_IDS.PT_TYPES_SUV_BSA,
      viewportId: VIEWPORT_IDS.PT_TYPES_SUV_BSA.CORONAL,
      type: ViewportType.ORTHOGRAPHIC,
      element: elementContainers.get(2),
      defaultOptions: {
        orientation: ORIENTATION.CORONAL,
        background: [1, 1, 1],
      },
    },
  ]

  renderingEngine.setViewports(viewportInput)

  const renderingEngineUID = renderingEngine.uid

  viewportInput.forEach((viewportInputEntry) => {
    const { sceneUID, viewportId } = viewportInputEntry

    ptTypesSceneToolGroup.addViewport(viewportId, renderingEngineUID)
  })
}

function setPetBWTransferFunction({ volumeActor, volumeUID }) {
  const rgbTransferFunction = volumeActor
    .getProperty()
    .getRGBTransferFunction(0)

  rgbTransferFunction.setRange(0, 5)

  utilities.invertRgbTransferFunction(rgbTransferFunction)
}

function setPetLBMTransferFunction({ volumeActor, volumeUID }) {
  const imageVolume = cache.getVolume(volumeUID)

  let { suvbwToSuvlbm: scalingFactor } = imageVolume.scaling.PET

  if (scalingFactor === undefined) {
    console.warn(
      'No suvbwToSuvlbm scaling factor, likely missing PatientWeight, PatientSex or PatientSize from dataset'
    )

    scalingFactor = 1
  }

  const max = 5 * scalingFactor

  const rgbTransferFunction = volumeActor
    .getProperty()
    .getRGBTransferFunction(0)

  rgbTransferFunction.setRange(0, max)

  utilities.scaleRgbTransferFunction(rgbTransferFunction, scalingFactor)
  utilities.invertRgbTransferFunction(rgbTransferFunction)
}

function setPetBSATransferFunction({ volumeActor, volumeUID }) {
  const imageVolume = cache.getVolume(volumeUID)

  let { suvbwToSuvbsa: scalingFactor } = imageVolume.scaling.PET

  if (scalingFactor === undefined) {
    console.warn(
      'No suvbwToSuvbsa scaling factor, likely missing PatientWeight or PatientSize from dataset'
    )

    scalingFactor = 1
  }

  const rgbTransferFunction = volumeActor
    .getProperty()
    .getRGBTransferFunction(0)

  const max = 5 * scalingFactor

  rgbTransferFunction.setRange(0, max)

  utilities.scaleRgbTransferFunction(rgbTransferFunction, scalingFactor)
  utilities.invertRgbTransferFunction(rgbTransferFunction)
}

function setVolumes(renderingEngine, ptVolumeUID) {
  const ptBWScene = renderingEngine.getScene(SCENE_IDS.PT_TYPES_SUV_BW)
  const ptLBMScene = renderingEngine.getScene(SCENE_IDS.PT_TYPES_SUV_LBM)
  const ptBSAScene = renderingEngine.getScene(SCENE_IDS.PT_TYPES_SUV_BSA)

  ptBWScene.setVolumes([
    { volumeUID: ptVolumeUID, callback: setPetBWTransferFunction },
  ])
  ptLBMScene.setVolumes([
    { volumeUID: ptVolumeUID, callback: setPetLBMTransferFunction },
  ])
  ptBSAScene.setVolumes([
    { volumeUID: ptVolumeUID, callback: setPetBSATransferFunction },
  ])
}

export default { setLayout, setVolumes }
