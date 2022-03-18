import { state } from '../index'
import { removeSegmentationsForToolGroup } from '../../stateManagement/segmentation'

// ToolGroups function entirely by their "state" being queried and leveraged
// removing a ToolGroup from state is equivalent to killing it

/**
 * Given a tool group UID, destroy the toolGroup. It will also cleanup all segmentations
 * associated with that tool group too
 *
 * @param toolGroupUID - The UID of the tool group to be destroyed.
 */
function destroyToolGroupByToolGroupUID(toolGroupUID: string): void {
  const toolGroupIndex = state.toolGroups.findIndex(
    (tg) => tg.uid === toolGroupUID
  )

  if (toolGroupIndex > -1) {
    // Todo: this should not happen here)
    removeSegmentationsForToolGroup(toolGroupUID)
    state.toolGroups.splice(toolGroupIndex, 1)
  }
}

export default destroyToolGroupByToolGroupUID
