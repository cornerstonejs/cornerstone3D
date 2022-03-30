// `BaseManager` or IManager interface for duplicate API between ToolGroup/Synchronizer?
import { state as csToolsState } from '../index';
import destroyToolGroup from './destroyToolGroup';

// ToolGroups function entirely by their "state" being queried and leveraged
// removing a ToolGroup from state is equivalent to killing it. Calling
// destroyToolGroup() to make sure the SegmentationDisplayTools
// have been removed from the toolGroup Viewports. //Todo: this makes more sense
// to be based on events, but we don't have any toolGroup created/removed events

/**
 * Destroy all tool groups
 */
function destroy(): void {
  const toolGroups = [...csToolsState.toolGroups];

  for (const toolGroup of toolGroups) {
    destroyToolGroup(toolGroup.id);
  }

  csToolsState.toolGroups = [];
}

export default destroy;
