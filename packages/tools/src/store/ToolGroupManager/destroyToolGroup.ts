import { state } from '../state';
// ToolGroups function entirely by their "state" being queried and leveraged
// removing a ToolGroup from state is equivalent to killing it

/**
 * Given a tool group Id, destroy the toolGroup. It will also cleanup all segmentations
 * associated with that tool group too
 *
 * @param toolGroupId - The Id of the tool group to be destroyed.
 */
function destroyToolGroup(toolGroupId: string): void {
  const toolGroupIndex = state.toolGroups.findIndex(
    (tg) => tg.id === toolGroupId
  );

  if (toolGroupIndex > -1) {
    state.toolGroups.splice(toolGroupIndex, 1);
  }
}

export default destroyToolGroup;
