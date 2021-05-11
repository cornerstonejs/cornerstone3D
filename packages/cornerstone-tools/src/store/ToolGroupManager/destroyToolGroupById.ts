import { state } from '../index'

// ToolGroups function entirely by their "state" being queried and leveraged
// removing a ToolGroup from state is equivelant to killing it
function destroyToolGroupById(toolGroupId: string): void {
  const toolGroupIndex = state.toolGroups.findIndex(
    (tg) => tg.id === toolGroupId
  )

  if (toolGroupIndex > -1) {
    state.toolGroups.splice(toolGroupIndex, 1)
  }
}

export default destroyToolGroupById
