// `BaseManager` or IManager interface for duplicate API between ToolGroup/Synchronizer?
import { state } from './../index'

// ToolGroups function entirely by their "state" being queried and leveraged
// removing a ToolGroup from state is equivelant to killing it
function destroy(): void {
  state.toolGroups = []
}

export default destroy
