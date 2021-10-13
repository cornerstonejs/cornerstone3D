import {
  getRenderingEngines,
  VolumeViewport,
  triggerEvent,
} from '@ohif/cornerstone-render'

import state from './state'
import { CornerstoneTools3DEvents as EVENTS } from '../../enums'

export type LabelmapStateUpdatedEvent = {
  canvas: HTMLCanvasElement
  labelmapUID: string // volumeUID of the labelmap whose state has been updated
  labelmapIndex: number // index of the modified labelmap in viewport's array of labelmaps state
  activeLabelmapIndex: number // active labelmapIndex for the viewport
  renderingEngineUID: string
  sceneUID: string
  viewportUID: string
}

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
 * LABELMAP_STATE_UPDATED event on those viewports. If an element is provided,
 * it only triggers on the viewport containing the element.
 * @param labelmapUID volumeUID of the labelmap
 */
function triggerLabelmapStateUpdated(
  labelmapUID: string,
  element?: HTMLCanvasElement
): void {
  const viewportUIDs = _getViewportUIDsForLabelmapUID(labelmapUID)

  const renderingEngine = getRenderingEngines()[0]
  const { uid: renderingEngineUID } = renderingEngine

  viewportUIDs.forEach((viewportUID) => {
    const viewportLabelmapsState = state.volumeViewports[viewportUID]
    const viewport = renderingEngine.getViewport(viewportUID) as VolumeViewport
    const { canvas } = viewport

    // If the viewport displays the labelmap (either active or inactive), but
    // its state with regard to labelmap has not changed, bail out
    if (element && element !== canvas) {
      return
    }

    const scene = viewport.getScene()
    const { uid: sceneUID } = scene

    const activeLabelmapIndex = viewportLabelmapsState.activeLabelmapIndex

    viewportLabelmapsState.labelmaps.forEach((labelmapState, labelmapIndex) => {
      // Only trigger event for the the requested labelmapUID
      if (labelmapState.volumeUID !== labelmapUID) {
        return
      }

      const eventData: LabelmapStateUpdatedEvent = {
        canvas,
        labelmapUID,
        labelmapIndex,
        activeLabelmapIndex,
        renderingEngineUID,
        sceneUID,
        viewportUID,
      }

      triggerEvent(canvas, EVENTS.LABELMAP_STATE_UPDATED, eventData)
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
function triggerLabelmapsStateUpdated(labelmapUIDs?: string[]): void {
  const { volumeViewports } = state

  if (!volumeViewports) {
    return
  }

  let labelmapUIDsToUse = labelmapUIDs
  if (!labelmapUIDs || !labelmapUIDs.length) {
    labelmapUIDsToUse = state.labelmaps.map(({ volumeUID }) => volumeUID)
  }

  labelmapUIDsToUse.forEach((labelmapUID) => {
    triggerLabelmapStateUpdated(labelmapUID)
  })
}

export { triggerLabelmapsStateUpdated, triggerLabelmapStateUpdated }
