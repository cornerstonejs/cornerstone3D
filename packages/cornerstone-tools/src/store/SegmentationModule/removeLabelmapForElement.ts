import {
  getEnabledElement,
  triggerEvent,
  StackViewport,
  cache,
  getRenderingEngines,
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
  const { scene, viewport } = enabledElement

  // StackViewport Implementation
  if (viewport instanceof StackViewport) {
    throw new Error('Segmentation for StackViewport is not supported yet')
  }

  // remove the labelmap actor from the scene
  // Add labelmap volumes to the scene to be be rendered, but not force the render
  scene.removeVolumes([labelmapUID])

  // updating the states
  const viewportUIDs = scene.getViewportUIDs()

  // Updating viewport-specific labelmap states
  viewportUIDs.forEach((viewportUID) => {
    // VolumeViewport Implementation
    const viewportLabelmapsState = state.volumeViewports[viewportUID]

    if (!viewportLabelmapsState) {
      return
    }

    // check which labelmap index is associated with the labelmap UID
    const labelmapIndex = viewportLabelmapsState.labelmaps.findIndex(
      (labelmap) => labelmap.volumeUID === labelmapUID
    )

    // if viewport's current activeLabelmapIndex is the same as the labelmapIndex
    // then we need to update the activeLabelmapIndex to index 0, after
    // we remove the labelmap from viewport's state.
    const removingActiveLabelmap =
      viewportLabelmapsState.activeLabelmapIndex === labelmapIndex

    // remove the labelmap from the viewport's state
    viewportLabelmapsState.labelmaps.splice(labelmapIndex, 1)

    // if there are labelmaps left in the viewport's state
    if (viewportLabelmapsState.labelmaps.length > 0 && removingActiveLabelmap) {
      viewportLabelmapsState.activeLabelmapIndex = 0
    } else {
      delete state.volumeViewports[viewportUID]
    }
  })

  const eventData = {
    element,
    labelmapUID,
    sceneUID: scene.uid,
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
