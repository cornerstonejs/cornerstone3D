import { getEnabledElement } from '@ohif/cornerstone-render'
import state from './state'

function getLabelmapUIDsForElement(canvas: HTMLCanvasElement): string[] {
  const enabledElement = getEnabledElement(canvas)

  if (!enabledElement) {
    return
  }

  const { scene, viewportUID } = enabledElement

  // stackViewport
  if (!scene) {
    throw new Error('Segmentation for StackViewport is not supported yet')
  }

  const viewportState = state.volumeViewports[viewportUID]

  if (!viewportState) {
    return []
  }

  return viewportState.labelmaps.map(({ volumeUID }) => volumeUID)
}

function getLabelmapUIDsForViewportUID(viewportUID: string): string[] {
  const viewportState = state.volumeViewports[viewportUID]

  if (!viewportState) {
    return []
  }

  return viewportState.labelmaps.map(({ volumeUID }) => volumeUID)
}

export { getLabelmapUIDsForElement, getLabelmapUIDsForViewportUID }
