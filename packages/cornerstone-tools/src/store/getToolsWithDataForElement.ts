import { getEnabledElement } from '@precisionmetrics/cornerstone-render'
import { getToolState } from '../stateManagement/annotation/toolState'
import { ToolAndToolStateArray } from '../types/toolStateTypes'
import type BaseAnnotationTool from '../tools/base/BaseAnnotationTool'

/**
 * Filters an array of tools, returning only tools which have annotation data.
 *
 * @param element - The cornerstone3D enabled element.
 * @param tools - The array of tools to check.
 *
 * @returns The array of tools with their found toolState.
 */
export default function getToolsWithDataForElement(
  element: HTMLElement,
  tools: BaseAnnotationTool[]
): ToolAndToolStateArray {
  const result = []

  for (let i = 0; i < tools.length; i++) {
    const tool = tools[i]

    if (!tool) {
      console.warn('undefined tool in getToolsWithDataForElement')
      continue
    }

    const enabledElement = getEnabledElement(element)
    let toolState = getToolState(enabledElement, tool.name)

    if (!toolState) {
      continue
    }

    if (typeof tool.filterInteractableToolStateForElement === 'function') {
      // If the tool has a toolState filter (e.g. with in-plane-annotations-only filtering), use it.
      toolState = tool.filterInteractableToolStateForElement(element, toolState)
    }

    if (toolState?.length > 0) {
      result.push({ tool, toolState })
    }
  }

  return result
}
