import { state } from '../index'
import { removeSegmentationsForToolGroup } from '../../stateManagement/segmentation'

// ToolGroups function entirely by their "state" being queried and leveraged
// removing a ToolGroup from state is equivelant to killing it
function destroyToolGroupByToolGroupUID(toolGroupUID: string): void {
  const toolGroupIndex = state.toolGroups.findIndex(
    (tg) => tg.uid === toolGroupUID
  )

  if (toolGroupIndex > -1) {
    removeSegmentationsForToolGroup(toolGroupUID)
    state.toolGroups.splice(toolGroupIndex, 1)
  }
}

export default destroyToolGroupByToolGroupUID
