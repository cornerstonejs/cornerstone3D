import { getRenderingEngine } from '@ohif/cornerstone-render'
import state from '../../store/SegmentationModule/state'
import setLabelmapColorAndOpacity from '../../store/SegmentationModule/setLabelmapColorAndOpacity'
import csToolsEvents from '../../enums/CornerstoneTools3DEvents'

function updateLabelmapProperties(
  viewportUID: string,
  sceneUID: string,
  renderingEngineUID: string,
  activeLabelmapIndex: number
): void {
  if (!sceneUID) {
    throw new Error('Stack viewport segmentation not supported yet')
  }

  const renderingEngine = getRenderingEngine(renderingEngineUID)
  const scene = renderingEngine.getScene(sceneUID)

  // Render only active labelmaps from the viewport state
  const viewportLabelmapsState = state.volumeViewports[viewportUID].labelmaps
  const { volumeUID: activeLabelmapUID } =
    viewportLabelmapsState[activeLabelmapIndex]

  viewportLabelmapsState.forEach((labelmapState) => {
    const {
      volumeUID: labelmapUID,
      colorLUTIndex,
      cfun,
      ofun,
      labelmapConfig,
    } = labelmapState
    const volumeActor = scene.getVolumeActor(labelmapUID)

    const isActiveLabelmap = activeLabelmapUID === labelmapUID

    setLabelmapColorAndOpacity(
      volumeActor,
      cfun,
      ofun,
      colorLUTIndex,
      labelmapConfig,
      isActiveLabelmap
    )
  })
}

const onLabelmapStateUpdated = function (evt) {
  const { sceneUID, viewportUID, renderingEngineUID } = evt.detail
  const renderingEngine = getRenderingEngine(renderingEngineUID)

  if (!sceneUID) {
    throw new Error('Segmentation for stack viewports not implemented yet')
  }

  const { activeLabelmapIndex } = state.volumeViewports[viewportUID]

  updateLabelmapProperties(
    viewportUID,
    sceneUID,
    renderingEngineUID,
    activeLabelmapIndex
  )

  renderingEngine.renderScene(sceneUID)
}

const enable = function (element: HTMLElement) {
  element.addEventListener(
    csToolsEvents.LABELMAP_STATE_UPDATED,
    onLabelmapStateUpdated
  )
}

const disable = function (element: HTMLElement) {
  element.removeEventListener(
    csToolsEvents.LABELMAP_STATE_UPDATED,
    onLabelmapStateUpdated
  )
}

export default {
  enable,
  disable,
}
