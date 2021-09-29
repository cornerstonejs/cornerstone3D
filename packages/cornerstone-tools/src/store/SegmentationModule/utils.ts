import {
  getEnabledElement,
  getRenderingEngines,
  VolumeViewport,
  triggerEvent,
} from '@ohif/cornerstone-render'

import state from './state'
import { CornerstoneTools3DEvents as EVENTS } from '../../enums'

/**
 * Triggers a re-render for all labelmaps, this method can be used to make the
 * a modified global configuration applied on all labelmaps
 */
function triggerLabelmapsUpdated(labelmapUID?: string): void {
  const { volumeViewports } = state

  if (!volumeViewports) {
    return
  }

  // Todo: this feels wrong
  const renderingEngine = getRenderingEngines()[0]
  const { uid: renderingEngineUID } = renderingEngine

  // todo
  if (labelmapUID) {
    // find the volumeUID of the labelmap and only trigger for that
  }

  Object.keys(volumeViewports).forEach((viewportUID) => {
    const viewportState = volumeViewports[viewportUID]
    const viewport = renderingEngine.getViewport(viewportUID) as VolumeViewport
    const { canvas } = viewport

    const scene = viewport.getScene()
    const { uid: sceneUID } = scene

    viewportState.labelmaps.forEach((labelmapState, labelmapIndex) => {
      const eventData = {
        canvas,
        labelmapUID: labelmapState.volumeUID,
        labelmapIndex,
        renderingEngineUID,
        sceneUID,
        viewportUID,
        scene,
      }

      triggerEvent(canvas, EVENTS.LABELMAP_UPDATED, eventData)
    })
  })
}

/**
 * Returns the next labelmap Index that can be set on the canvas. It checks
 * all the available labelmaps for the element, and increases that number by 1
 * or return 0 if no labelmap is provided
 * @param canvas HTMLCanvasElement
 * @returns next LabelmapIndex
 */
function getNextLabelmapIndex(canvas) {
  const enabledElement = getEnabledElement(canvas)

  if (!enabledElement) {
    return
  }

  const { viewportUID } = enabledElement

  // VolumeViewport Implementation
  const viewportSegState = state.volumeViewports[viewportUID]

  if (!viewportSegState) {
    return 0
  }

  const numLabelmaps = viewportSegState.labelmaps.filter(
    (labelmapUID) => !!labelmapUID
  ).length

  // next labelmap index = current length of labelmaps
  return numLabelmaps
}

function getActiveSegmentIndexForLabelmapUID(
  canvas: HTMLCanvasElement,
  labelmapUID: string
): number {
  const enabledElement = getEnabledElement(canvas)

  if (!enabledElement) {
    return
  }

  const { viewportUID } = enabledElement

  // VolumeViewport Implementation
  const viewportSegState = state.volumeViewports[viewportUID]

  const labelmapState = viewportSegState.labelmaps.find(
    ({ volumeUID }) => volumeUID === labelmapUID
  )

  // next labelmap index = current length of labelmaps
  return labelmapState.activeSegmentIndex
}

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

export {
  getNextLabelmapIndex,
  getLabelmapUIDsForElement,
  getLabelmapUIDsForViewportUID,
  getActiveSegmentIndexForLabelmapUID,
  triggerLabelmapsUpdated,
}
