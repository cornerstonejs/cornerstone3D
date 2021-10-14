import { ToolGroupManager } from '../store'
import { ToolModes } from '../enums'
import { getEnabledElement } from '@ohif/cornerstone-render'

type ModesFilter = Array<ToolModes>

/**
 * Finds the enabled element, and iterates over the tools inside its
 * toolGroup. Returns the list of tool instances that are valid based
 * on the provided tool mode.
 *
 * @param element Canvas element
 * @param modesFilter tool modes: active, passive, enabled, disabled
 * @returns enabled tool instances
 */
export default function getToolsWithModesForElement(
  element: HTMLElement,
  modesFilter: ModesFilter
) {
  const enabledElement = getEnabledElement(element)
  const { renderingEngineUID, sceneUID, viewportUID } = enabledElement

  const toolGroups = ToolGroupManager.getToolGroups(
    renderingEngineUID,
    sceneUID,
    viewportUID
  )

  const enabledTools = []

  for (let i = 0; i < toolGroups.length; i++) {
    const toolGroup = toolGroups[i]
    const toolGroupToolNames = Object.keys(toolGroup.toolOptions)

    for (let j = 0; j < toolGroupToolNames.length; j++) {
      const toolName = toolGroupToolNames[j]
      const tool = toolGroup.toolOptions[toolName]

      if (modesFilter.includes(tool.mode)) {
        const toolInstance = toolGroup._toolInstances[toolName]
        enabledTools.push(toolInstance)
      }
    }
  }

  return enabledTools
}
