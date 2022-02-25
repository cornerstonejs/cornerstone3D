import { getEnabledElement, Types } from '@precisionmetrics/cornerstone-render'
import { BaseAnnotationTool } from '../tools'
import { Point2, ToolSpecificToolData } from '../types'
import { getToolState } from '../stateManagement/annotation/toolState'
import ToolGroupManager from './ToolGroupManager'

function getToolDataNearPoint(
  element: HTMLElement,
  point: Point2,
  proximity = 5
): ToolSpecificToolData | null {
  const enabledElement = getEnabledElement(element)
  if (enabledElement) {
    return getToolDataNearPointOnEnabledElement(
      enabledElement,
      point,
      proximity
    )
  }
  return null
}

function getToolDataNearPointOnEnabledElement(
  enabledElement: Types.IEnabledElement,
  point: Point2,
  proximity: number
): ToolSpecificToolData | null {
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
    if (Object.prototype.hasOwnProperty.call(tools, name)) {
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
  }
  return null
}

function findToolDataNearPointByTool(
  tool: BaseAnnotationTool,
  enabledElement: Types.IEnabledElement,
  point: Point2,
  proximity: number
): ToolSpecificToolData | null {
  const toolState = getToolState(enabledElement, tool.name)
  if (Array.isArray(toolState) && toolState.length > 0) {
    const { element } = enabledElement.viewport
    for (let i = 0; i < toolState.length; ++i) {
      const toolData = toolState[i] as ToolSpecificToolData
      if (
        tool.pointNearTool(element, toolData, point, proximity, '') ||
        tool.getHandleNearImagePoint(element, toolData, point, proximity)
      ) {
        return toolData
      }
    }
  }
  return null
}

export {
  getToolDataNearPoint as default,
  getToolDataNearPoint,
  getToolDataNearPointOnEnabledElement,
  findToolDataNearPointByTool,
}
