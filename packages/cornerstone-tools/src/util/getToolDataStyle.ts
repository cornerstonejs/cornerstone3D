import { ToolDataStates } from '../enums'
import { ToolSpecificToolData } from '../types'
import { isToolDataSelected } from '../stateManagement/toolDataSelection'

export default function getToolDataStyle(
  toolData?: ToolSpecificToolData
): ToolDataStates {
  if (toolData) {
    if (toolData.data && toolData.data.active) return ToolDataStates.Highlighted
    if (isToolDataSelected(toolData)) return ToolDataStates.Selected
  }
  return ToolDataStates.Default
}
