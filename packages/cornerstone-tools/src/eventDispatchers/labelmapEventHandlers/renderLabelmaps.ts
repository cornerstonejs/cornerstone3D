import { getRenderingEngine } from '@ohif/cornerstone-render'
import state from '../../store/SegmentationModule/state'
import setLabelmapColorAndOpacity from '../../store/SegmentationModule/setLabelmapColorAndOpacity'

export default function renderLabelmaps(
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

  scene.render()
}
