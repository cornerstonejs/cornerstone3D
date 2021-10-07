import {
  getRenderingEngines,
  VolumeViewport,
  triggerEvent,
} from '@ohif/cornerstone-render'

import state, { getLabelmapsStateForElement } from './state'
import { CornerstoneTools3DEvents as EVENTS } from '../../enums'
import { getActiveLabelmapIndex } from '.'

/**
 * Triggers a re-render for all labelmaps, this method can be used to make the
 * a modified global configuration applied on all labelmaps for now
 *
 */
// Todo: add implementation for only one labelmap
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

// /**
//  * Returns the labelmapUIDs that the viewport with the provided viewportUID contains
//  * @param viewportUID Viewport UID
//  * @returns
//  */
// function getLabelmapUIDsForViewportUID(viewportUID: string): string[] {
//   const viewportState = state.volumeViewports[viewportUID]

//   if (!viewportState) {
//     return []
//   }

//   return viewportState.labelmaps.map(({ volumeUID }) => volumeUID)
// }

/**
 * Returns all the labelmapUIDs of the HTML element (active and inactive)
 * @param canvas HTML canvas
 * @returns
 */
function getLabelmapUIDsForElement(canvas: HTMLCanvasElement): string[] {
  const viewportLabelmapsState = getLabelmapsStateForElement(canvas)

  if (!viewportLabelmapsState) {
    return []
  }

  return viewportLabelmapsState.labelmaps.map(({ volumeUID }) => volumeUID)
}

/**
 * Returns the labelmapUIDs that the viewport with the provided viewportUID contains
 * @param viewportUID Viewport UID
 * @returns
 */
function getLabelmapUIDForElement(
  canvas: HTMLCanvasElement,
  labelmapIndex?: number
): string | undefined {
  const viewportLabelmapsState = getLabelmapsStateForElement(canvas)

  if (!viewportLabelmapsState) {
    return
  }

  const index = labelmapIndex ? labelmapIndex : getActiveLabelmapIndex(canvas)

  return viewportLabelmapsState.labelmaps[index].volumeUID
}

export {
  triggerLabelmapsUpdated,
  getLabelmapUIDsForElement,
  getLabelmapUIDForElement,
  // getNextLabelmapIndex,
  // getLabelmapUIDsForViewportUID,
  // getActiveSegmentIndexForLabelmapUID,
  // getLockedSegmentsForLabelmapUID,
}
