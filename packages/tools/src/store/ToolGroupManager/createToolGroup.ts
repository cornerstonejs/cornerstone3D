import { state } from '../state';
import ToolGroup from './ToolGroup';
import type { IToolGroup } from '../../types';

/**
 * Create a new tool group with the given name. ToolGroups are the new way
 * in Cornerstone3DTools to share tool configuration, state (enabled, disabled, etc.)
 * across a set of viewports.
 *
 * @param toolGroupId - The unique ID of the tool group.
 * @returns A reference to the tool group that was created.
 */
function createToolGroup(toolGroupId: string): IToolGroup {
  // Exit early if ID conflict
  const toolGroupWithSameId = state.toolGroups.find(
    (tg) => tg.id === toolGroupId
  );
  if (toolGroupWithSameId) {
    console.warn(`'${toolGroupId}' already exists.`);
    return toolGroupWithSameId;
  }

  const toolGroup = new ToolGroup(toolGroupId);

  // Update state
  state.toolGroups.push(toolGroup);

  // Return reference
  return toolGroup;
}

export default createToolGroup;
