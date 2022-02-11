import {
  getEnabledElement,
  VolumeViewport,
} from '@precisionmetrics/cornerstone-render'
import state from '../../store/SegmentationModule/state'
import setLabelmapColorAndOpacity from '../../store/SegmentationModule/setLabelmapColorAndOpacity'
import csToolsEvents from '../../enums/CornerstoneTools3DEvents'

function updateLabelmapProperties(
  viewport: VolumeViewport,
  activeLabelmapIndex: number
): void {
  // Render only active labelmaps from the viewport state
  const viewportLabelmapsState = state.volumeViewports[viewport.uid].labelmaps
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
    const { volumeActor } = viewport.getActor(labelmapUID)

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
  const { viewport, viewportUID, renderingEngine } = getEnabledElement(
    evt.detail.element
  )

  if (!(viewport instanceof VolumeViewport)) {
    throw new Error('Segmentation for stack viewports not implemented yet')
  }

  const { activeLabelmapIndex } = state.volumeViewports[viewportUID]

  updateLabelmapProperties(viewport, activeLabelmapIndex)

  renderingEngine.renderViewport(viewportUID)
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
