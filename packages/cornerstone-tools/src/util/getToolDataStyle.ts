import { ToolDataStates } from '../enums'
import { ToolSpecificToolData } from '../types'
import { isToolDataLocked } from '../stateManagement/toolDataLocking'
import { isToolDataSelected } from '../stateManagement/toolDataSelection'

type ToolData = {
  active?: boolean
}

export default function getToolDataStyle(
  toolData?: ToolSpecificToolData
): ToolDataStates {
  if (toolData) {
    if (toolData.data && (toolData.data as ToolData).active)
      return ToolDataStates.Highlighted
    if (isToolDataSelected(toolData)) return ToolDataStates.Selected
    if (isToolDataLocked(toolData)) return ToolDataStates.Locked
  }
  return ToolDataStates.Default
}
