import {
  getRenderingEngines,
  VolumeViewport,
  triggerEvent,
} from '@ohif/cornerstone-render'

import state, { getLabelmapsStateForElement } from './state'
import { CornerstoneTools3DEvents as EVENTS } from '../../enums'
import { getActiveLabelmapIndex } from '.'

/**
 * Returns the list of viewportUIDs that include labelmapUID in their labelmaps state
 * @param labelmapUID volumeUID of the labelmap
 * @returns array of viewportUIDs
 */
function _getViewportUIDsForLabelmapUID(labelmapUID: string): string[] {
  const viewportUIDs = []
  Object.keys(state.volumeViewports).forEach((viewportUID) => {
    const viewportLabelmapsState = state.volumeViewports[viewportUID]
    viewportLabelmapsState.labelmaps.forEach((labelmapState) => {
      if (labelmapState.volumeUID === labelmapUID) {
        viewportUIDs.push(viewportUID)
      }
    })
  })
  return viewportUIDs
}

/**
 * Finds the viewports containing the labelmap (by UID), and triggers a
 * LABELMAP_UPDATED event on those viewports for the labelmapUID
 * @param labelmapUID volumeUID of the labelmap
 */
function triggerLabelmapUpdated(labelmapUID: string): void {
  const viewportUIDs = _getViewportUIDsForLabelmapUID(labelmapUID)

  // Todo: search in renderingEngines and find which one has the viewportUIDs and
  const renderingEngine = getRenderingEngines()[0]
  const { uid: renderingEngineUID } = renderingEngine

  viewportUIDs.forEach((viewportUID) => {
    const viewportLabelmapsState = state.volumeViewports[viewportUID]
    const viewport = renderingEngine.getViewport(viewportUID) as VolumeViewport
    const { canvas } = viewport

    const scene = viewport.getScene()
    const { uid: sceneUID } = scene

    viewportLabelmapsState.labelmaps.forEach((labelmapState, labelmapIndex) => {
      // Only trigger event for the the requested labelmapUID
      if (labelmapState.volumeUID !== labelmapUID) {
        return
      }

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
 * Finds the viewports containing the labelmapUIDs, and triggers
 * LABELMAP_UPDATED event on those viewports for all the provided labelmapUIDs.
 * If no labelmapUIDs are provided, it will trigger a LABELMAP_UPDATED on all
 * the labelmaps in the state.
 * @param labelmapUID volumeUID of the labelmap
 */
function triggerLabelmapsUpdated(labelmapUIDs?: string[]): void {
  const { volumeViewports } = state

  if (!volumeViewports) {
    return
  }

  let labelmapUIDsToUse
  if (!labelmapUIDs || !labelmapUIDs.length) {
    labelmapUIDsToUse = state.labelmaps.map(({ volumeUID }) => volumeUID)
  }

  labelmapUIDsToUse.forEach((labelmapUID) => {
    triggerLabelmapUpdated(labelmapUID)
  })
}

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
 * Returns the labelmapUID that the element is rendering, if no labelmapIndex is
 * provided it uses the active labelmapIndex
 * @param canvas HTMLCanvasElement
 * @param labelmapIndex labelmap index in the viewportLabelmapsState
 * @returns labelmapUID
 */
function getLabelmapUIDForElement(
  canvas: HTMLCanvasElement,
  labelmapIndex?: number
): string | undefined {
  const viewportLabelmapsState = getLabelmapsStateForElement(canvas)

  if (!viewportLabelmapsState) {
    return
  }

  const index =
    labelmapIndex === undefined ? getActiveLabelmapIndex(canvas) : labelmapIndex

  return viewportLabelmapsState.labelmaps[index].volumeUID
}

export {
  triggerLabelmapsUpdated,
  triggerLabelmapUpdated,
  getLabelmapUIDsForElement,
  getLabelmapUIDForElement,
}
