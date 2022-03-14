import { getEnabledElement } from '@precisionmetrics/cornerstone-render'
import type { Types } from '@precisionmetrics/cornerstone-render'

import { BaseAnnotationTool } from '../tools'
import { ToolSpecificToolData } from '../types'
import { getToolState } from '../stateManagement/annotation/toolState'
import ToolGroupManager from './ToolGroupManager'

/**
 * Get the tool data that is close to the provided canvas point, it will return
 * the first toolData that is found.
 *
 * @param element - The element to search for a tool data on.
 * @param canvasPoint - The canvasPoint on the page where the user clicked.
 * @param proximity - The distance from the canvasPoint to the tool data.
 * @returns The tool data for the element
 */
function getToolDataNearPoint(
  element: HTMLElement,
  canvasPoint: Types.Point2,
  proximity = 5
): ToolSpecificToolData | null {
  // Todo: this function should return closest tool data, BUT, we are not using
  // the function anywhere.
  const enabledElement = getEnabledElement(element)
  if (!enabledElement) {
    throw new Error('getToolDataNearPoint: enabledElement not found')
  }

  return getToolDataNearPointOnEnabledElement(
    enabledElement,
    canvasPoint,
    proximity
  )
}

/**
 * "Find the tool data near the point on the enabled element." it will return the
 * first toolData that is found.
 *
 * @param enabledElement - The element that is currently active.
 * @param point - The point to search near.
 * @param proximity - The distance from the point that the tool data must
 * be within.
 * @returns A ToolSpecificToolData object.
 */
function getToolDataNearPointOnEnabledElement(
  enabledElement: Types.IEnabledElement,
  point: Types.Point2,
  proximity: number
): ToolSpecificToolData | null {
  // Todo: this function should return closest tool data, BUT, we are not using
  // the function anywhere.
  const { renderingEngineUID, viewportUID } = enabledElement
  const toolGroup = ToolGroupManager.getToolGroup(
    renderingEngineUID,
    viewportUID
  )

  if (!toolGroup) {
    return null
  }

  const { _toolInstances: tools } = toolGroup
  for (const name in tools) {
    const found = findToolDataNearPointByTool(
      tools[name],
      enabledElement,
      point,
      proximity
    )
    if (found) {
      return found
    }
  }

  return null
}

/**
 * For the provided toolClass, it will find the toolData that is near the point,
 * it will return the first toolData that is found.
 *
 * @param tool - BaseAnnotationTool
 * @param enabledElement - The element that is currently active.
 * @param point - The point in the image where the user clicked.
 * @param proximity - The distance from the point that the tool must be
 * within to be considered "near" the point.
 * @returns The toolData object that is being returned is the toolData object that
 * is being used in the tool.
 */
function findToolDataNearPointByTool(
  tool: BaseAnnotationTool,
  enabledElement: Types.IEnabledElement,
  point: Types.Point2,
  proximity: number
): ToolSpecificToolData | null {
  // Todo: this function does not return closest tool data. It just returns
  // the first tool data that is found in the proximity. BUT, we are not using
  // the function anywhere.
  const toolState = getToolState(enabledElement, tool.name)
  if (toolState?.length) {
    const { element } = enabledElement.viewport
    for (const toolData of toolState) {
      if (
        tool.isPointNearTool(element, toolData, point, proximity, '') ||
        tool.getHandleNearImagePoint(element, toolData, point, proximity)
      ) {
        return toolData
      }
    }
  }
  return null
}

export { getToolDataNearPoint, getToolDataNearPointOnEnabledElement }
