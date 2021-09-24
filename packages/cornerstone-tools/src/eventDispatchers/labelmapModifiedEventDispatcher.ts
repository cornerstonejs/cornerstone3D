import { CornerstoneTools3DEvents as EVENTS } from '../enums'
import {
  renderActiveLabelmaps,
  renderInactiveLabelmaps,
} from './labelmapEventHandlers'
import { getSegmentationConfig } from '../store/SegmentationModule/segmentationConfig'
import state from '../store/SegmentationModule/state'

const onLabelmapModified = function (evt) {
  const { scene, viewportUID } = evt.detail
  const config = getSegmentationConfig()

  if (!scene) {
    throw new Error('Segmentation for stack viewports not implemented yet')
  }

  // Todo: can different viewport of scenes have different activeLabelmapIndex? I think not
  const { activeLabelmapIndex } = state.volumeViewports[viewportUID]

  if (config.renderInactiveLabelmaps) {
    renderInactiveLabelmaps(scene, viewportUID)
    return
  }

  renderActiveLabelmaps(scene, viewportUID, activeLabelmapIndex)
}

const enable = function (element) {
  element.addEventListener(EVENTS.LABELMAP_MODIFIED, onLabelmapModified)
}

const disable = function (element) {
  element.removeEventListener(EVENTS.LABELMAP_MODIFIED, onLabelmapModified)
}

export default {
  enable,
  disable,
}
