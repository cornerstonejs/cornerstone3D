import {
  getEnabledElement,
  triggerEvent,
  eventTarget,
} from '@ohif/cornerstone-render'
import { CornerstoneTools3DEvents as EVENTS } from '../enums'
import { Types } from '@ohif/cornerstone-render'
import { defaultFrameOfReferenceSpecificToolStateManager } from './FrameOfReferenceSpecificToolStateManager'
import { uuidv4 } from '../util'
import {
  ToolSpecificToolState,
  ToolSpecificToolData,
} from '../types/toolStateTypes'

function getViewportSpecificStateManager(
  element: Types.IEnabledElement | HTMLCanvasElement
) {
  // TODO:
  // We may want multiple FrameOfReferenceSpecificStateManagers.
  // E.g. displaying two different radiologists annotations on the same underlying data/FoR.

  // Just return the default for now.

  return defaultFrameOfReferenceSpecificToolStateManager
}

// TODO: Why is this now using enabledElement instead of element?
/**
 * getToolState - Returns the toolState for the `FrameOfReference` of the `Scene`
 * being viewed by the cornerstone3D enabled `element`.
 *
 * @param {HTMLElement} element
 * @param {string} toolName
 * @returns {ToolSpecificToolState} The tool state corresponding to the Frame of Reference and the toolName.
 */
function getToolState(
  // element: HTMLElement,
  enabledElement: Types.IEnabledElement,
  toolName: string
): ToolSpecificToolState {
  const toolStateManager = getViewportSpecificStateManager(enabledElement)
  const { FrameOfReferenceUID } = enabledElement

  return toolStateManager.get(FrameOfReferenceUID, toolName)
}

/**
 * @function addToolState
 *
 * @param {HTMLCanvasElement} element
 * @param {ToolSpecificToolData} toolData
 */
function addToolState(
  element: HTMLCanvasElement,
  toolData: ToolSpecificToolData
): void {
  const toolStateManager = getViewportSpecificStateManager(element)

  if (toolData.metadata.toolDataUID === undefined) {
    toolData.metadata.toolDataUID = uuidv4() as string
  }

  toolStateManager.addToolState(toolData)

  // trigger measurement added
  const enabledElement = getEnabledElement(element)
  const { renderingEngine } = enabledElement
  const { viewportUID, sceneUID } = enabledElement

  const eventType = EVENTS.MEASUREMENT_ADDED

  const eventDetail = {
    toolData,
    viewportUID,
    renderingEngineUID: renderingEngine.uid,
    sceneUID: sceneUID,
  }

  triggerEvent(eventTarget, eventType, eventDetail)
}

/**
 * @function removeToolState
 *
 * @param {*} element
 * @param {*} toolData
 */
function removeToolState(
  element: HTMLCanvasElement,
  toolData: ToolSpecificToolData
): void {
  const toolStateManager = getViewportSpecificStateManager(element)
  toolStateManager.removeToolState(toolData)

  // trigger measurement removed
  const enabledElement = getEnabledElement(element)
  const { renderingEngine } = enabledElement
  const { viewportUID, sceneUID } = enabledElement

  const eventType = EVENTS.MEASUREMENT_REMOVED

  const eventDetail = {
    toolData,
    viewportUID,
    renderingEngineUID: renderingEngine.uid,
    sceneUID: sceneUID,
  }

  triggerEvent(eventTarget, eventType, eventDetail)
}

/**
 * @function removeToolStateByToolDataUID
 *
 * @param {*} element
 * @param {*} toolDataUID
 */
function removeToolStateByToolDataUID(
  element: HTMLCanvasElement,
  toolDataUID: string
): void {
  const toolStateManager = getViewportSpecificStateManager(element)

  const toolData = toolStateManager.getToolStateByToolDataUID(toolDataUID)
  toolStateManager.removeToolStateByToolDataUID(toolDataUID)

  // trigger measurement removed
  const enabledElement = getEnabledElement(element)
  const { renderingEngine } = enabledElement
  const { viewportUID, sceneUID } = enabledElement

  const eventType = EVENTS.MEASUREMENT_REMOVED

  const eventDetail = {
    toolData,
    viewportUID,
    renderingEngineUID: renderingEngine.uid,
    sceneUID: sceneUID,
  }

  triggerEvent(eventTarget, eventType, eventDetail)
}

export {
  getToolState,
  addToolState,
  removeToolState,
  removeToolStateByToolDataUID,
  getViewportSpecificStateManager,
}
