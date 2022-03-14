import { Settings } from '@precisionmetrics/cornerstone-render'
import { ToolDataStyleStates } from '../../enums'
import { ToolSpecificToolData } from '../../types'
import { isToolDataLocked } from './toolDataLocking'
import { isToolDataSelected } from './toolDataSelection'
import { getStyleProperty } from './toolStyle'
import state from '../../store/state'

/**
 * Given a ToolSpecificToolData object, return the ToolDataStyleStates that it
 * should be in based on its data
 * @param toolData - The tool data that we want to style.
 * @returns The state of the tool data whether it is Default, Highlighted, Locked, or Selected.
 */
function getToolDataStyleState(
  toolData?: ToolSpecificToolData
): ToolDataStyleStates {
  if (toolData) {
    if (toolData.data && toolData.data.active)
      return ToolDataStyleStates.Highlighted
    if (isToolDataSelected(toolData)) return ToolDataStyleStates.Selected
    if (isToolDataLocked(toolData)) return ToolDataStyleStates.Locked
  }

  return ToolDataStyleStates.Default
}

/**
 * Set the style of a tool data object
 * @param string - toolName - The name of the tool.
 * @param toolData - The tool data object.
 * @param style - The style object to set.
 * @returns A boolean value indicating whether the style was set.
 */
function setToolDataStyle(
  toolName: string,
  toolData: Record<string, unknown>,
  style: Record<string, unknown>
): boolean {
  const descriptor = state.tools[toolName]
  if (descriptor) {
    const { toolClass } = descriptor
    return Settings.getObjectSettings(toolData, toolClass).set(
      'tool.style',
      style
    )
  }
  return false
}

export { getToolDataStyleState, setToolDataStyle }
