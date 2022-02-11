import {
  getEnabledElement,
  triggerEvent,
  StackViewport,
  cache,
  getRenderingEngines,
  getVolumeViewportsContatiningSameVolumes,
} from '@precisionmetrics/cornerstone-render'

import { CornerstoneTools3DEvents as EVENTS } from '../../enums'

import state, { removeLabelmapFromGlobalState } from './state'

function removeLabelmapForAllElements(
  labelmapUID: string,
  removeFromCache = false
): void {
  const viewportUIDs = Object.keys(state.volumeViewports)

  // Todo: better way to get elements from viewportUIDs
  const renderingEngine = getRenderingEngines()[0]

  viewportUIDs.forEach((viewportUID) => {
    const { element } = renderingEngine.getViewport(viewportUID)
    removeLabelmapForElement(element, labelmapUID, removeFromCache)
  })
}

function removeLabelmapForElement(
  element: HTMLElement,
  labelmapUID: string,
  removeFromCache = false
): void {
  const enabledElement = getEnabledElement(element)
  const { viewport } = enabledElement

  // StackViewport Implementation
  if (viewport instanceof StackViewport) {
    throw new Error('Segmentation for StackViewport is not supported yet')
  }

  const allViewportsWithLabelmap = [viewport]

  // Updating viewport-specific labelmap states
  allViewportsWithLabelmap.forEach((viewport) => {
    viewport.removeVolumes([labelmapUID])
    const viewportLabelmapsState = state.volumeViewports[viewport.uid]

    if (!viewportLabelmapsState) {
      return
    }

    // check which labelmap index is associated with the labelmap UID
    const labelmapIndex = viewportLabelmapsState.labelmaps.findIndex(
      (labelmap) => labelmap.volumeUID === labelmapUID
    )

    if (labelmapIndex === -1) {
      return
    }

    // if viewport's current activeLabelmapIndex is the same as the labelmapIndex
    // then we need to update the activeLabelmapIndex to index 0, after
    // we remove the labelmap from viewport's state.
    // Todo: this should move somewehere else
    const removingActiveLabelmap =
      viewportLabelmapsState.activeLabelmapIndex === labelmapIndex

    // remove the labelmap from the viewport's state
    viewportLabelmapsState.labelmaps.splice(labelmapIndex, 1)

    // if there are labelmaps left in the viewport's state
    if (viewportLabelmapsState.labelmaps.length > 0 && removingActiveLabelmap) {
      viewportLabelmapsState.activeLabelmapIndex = 0
    } else {
      delete state.volumeViewports[viewport.uid]
    }
  })

  const eventData = {
    element,
    labelmapUID,
  }

  triggerEvent(element, EVENTS.LABELMAP_REMOVED, eventData)

  // remove the labelmap from the cache
  if (removeFromCache) {
    if (cache.getVolumeLoadObject(labelmapUID)) {
      cache.removeVolumeLoadObject(labelmapUID)
    }
    removeLabelmapFromGlobalState(labelmapUID)
  }
}

export { removeLabelmapForElement, removeLabelmapForAllElements }
