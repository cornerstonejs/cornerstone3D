import {
  getEnabledElement,
  triggerEvent,
  eventTarget,
  Utilities as csUtils,
} from '@precisionmetrics/cornerstone-render'
import { CornerstoneTools3DEvents as EVENTS } from '../../enums'
import { Types } from '@precisionmetrics/cornerstone-render'
import { defaultFrameOfReferenceSpecificToolStateManager } from './FrameOfReferenceSpecificToolStateManager'
import {
  ToolSpecificToolState,
  ToolSpecificToolData,
} from '../../types/toolStateTypes'

import {
  MeasurementAddedEventData,
  MeasurementRemovedEventData,
} from '../../types/EventTypes'

/**
 * It returns the default tool state manager.
 * @returns the singleton default tool state manager.
 */
function getDefaultToolStateManager() {
  return defaultFrameOfReferenceSpecificToolStateManager
}

/**
 * Given an element, return the FrameOfReferenceSpecificStateManager for that
 * element
 * @param element - The element that the state manager is managing the state of.
 * @returns The default state manager
 */
function getViewportSpecificStateManager(
  element?: Types.IEnabledElement | HTMLElement
) {
  // TODO:
  // We may want multiple FrameOfReferenceSpecificStateManagers.
  // E.g. displaying two different radiologists annotations on the same underlying data/FoR.

  // Just return the default for now.

  return defaultFrameOfReferenceSpecificToolStateManager
}

// TODO: Why is this now using enabledElement instead of element?
/**
 * Returns the toolState for the `FrameOfReference` of the `Viewport`
 * being viewed by the cornerstone3D enabled `element`.
 *
 * @param enabledElement - The cornerstone enabled element.
 * @param toolName - The name of the tool.
 * @returns The tool state corresponding to the Frame of Reference and the toolName.
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
 * Add the toolData to the toolState for the `FrameOfReference` of the `Viewport`
 * being viewed by the cornerstone3D enabled `element`.
 *
 * @param element - HTMLElement
 * @param toolData - The tool data that is being added to the tool state manager.
 */
function addToolState(
  element: HTMLElement,
  toolData: ToolSpecificToolData
): void {
  const toolStateManager = getViewportSpecificStateManager(element)

  if (toolData.metadata.toolDataUID === undefined) {
    toolData.metadata.toolDataUID = csUtils.uuidv4() as string
  }

  toolStateManager.addToolState(toolData)

  const enabledElement = getEnabledElement(element)
  const { renderingEngine } = enabledElement
  const { viewportUID } = enabledElement

  const eventType = EVENTS.MEASUREMENT_ADDED

  const eventDetail: MeasurementAddedEventData = {
    toolData,
    viewportUID,
    renderingEngineUID: renderingEngine.uid,
  }

  triggerEvent(eventTarget, eventType, eventDetail)
}

/**
 * Remove the tool state from the tool state manager.
 * @param element - HTMLElement
 * @param toolData - The tool data that will be removed.
 */
function removeToolState(
  element: HTMLElement,
  toolData: ToolSpecificToolData
): void {
  const toolStateManager = getViewportSpecificStateManager(element)
  toolStateManager.removeToolState(toolData)

  // trigger measurement removed
  const enabledElement = getEnabledElement(element)
  const { renderingEngine } = enabledElement
  const { viewportUID } = enabledElement

  const eventType = EVENTS.MEASUREMENT_REMOVED

  const eventDetail: MeasurementRemovedEventData = {
    toolData,
    viewportUID,
    renderingEngineUID: renderingEngine.uid,
  }

  triggerEvent(eventTarget, eventType, eventDetail)
}

/**
 * Remove the toolData by UID of the toolData.
 * @param element - HTMLElement
 * @param toolDataUID - The unique identifier for the tool data.
 */
function removeToolStateByToolDataUID(
  element: HTMLElement,
  toolDataUID: string
): void {
  const toolStateManager = getViewportSpecificStateManager(element)

  const toolData = toolStateManager.getToolStateByToolDataUID(toolDataUID)
  toolStateManager.removeToolStateByToolDataUID(toolDataUID)

  // trigger measurement removed
  const enabledElement = getEnabledElement(element)
  const { renderingEngine } = enabledElement
  const { viewportUID } = enabledElement

  const eventType = EVENTS.MEASUREMENT_REMOVED

  const eventDetail = {
    toolData,
    viewportUID,
    renderingEngineUID: renderingEngine.uid,
  }

  triggerEvent(eventTarget, eventType, eventDetail)
}

/**
 * Get the ToolSpecificToolData object by its UID
 * @param toolDataUID - The unique identifier of the tool data.
 * @param element - The element that the tool is being used on.
 * @returns A ToolSpecificToolData object.
 */
function getToolDataByToolDataUID(
  toolDataUID: string,
  element?: HTMLElement
): ToolSpecificToolData {
  const toolStateManager = getViewportSpecificStateManager(element)
  const toolData = toolStateManager.getToolStateByToolDataUID(toolDataUID)

  return toolData
}

export {
  getToolState,
  addToolState,
  getToolDataByToolDataUID,
  removeToolState,
  removeToolStateByToolDataUID,
  getViewportSpecificStateManager,
  getDefaultToolStateManager,
}
