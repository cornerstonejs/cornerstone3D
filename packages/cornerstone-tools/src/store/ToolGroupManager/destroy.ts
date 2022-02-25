// `BaseManager` or IManager interface for duplicate API between ToolGroup/Synchronizer?
import { state as csToolsState } from '../index'
import destroyToolGroupByToolGroupUID from './destroyToolGroupByToolGroupUID'

// ToolGroups function entirely by their "state" being queried and leveraged
// removing a ToolGroup from state is equivalant to killing it. Calling
// destroyToolGroupByToolGroupUID() to make sure the SegmentationDisplayTools
// have been removed from the toolGroup Viewports. //Todo: this makes more sense
// to be based on events, but we don't have any toolGroup created/removed events
function destroy(): void {
  const toolGroups = [...csToolsState.toolGroups]

  for (const toolGroup of toolGroups) {
    destroyToolGroupByToolGroupUID(toolGroup.uid)
  }

  csToolsState.toolGroups = []
}

export default destroy
