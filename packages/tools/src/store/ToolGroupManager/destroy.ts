// `BaseManager` or IManager interface for duplicate API between ToolGroup/Synchronizer?
import { state } from '../state';
import destroyToolGroup from './destroyToolGroup';

// ToolGroups function entirely by their "state" being queried and leveraged
// removing a ToolGroup from state is equivalent to killing it.

/**
 * Destroy all tool groups
 */
function destroy(): void {
  const toolGroups = [...state.toolGroups];

  for (const toolGroup of toolGroups) {
    destroyToolGroup(toolGroup.id);
  }

  state.toolGroups = [];
}

export default destroy;
