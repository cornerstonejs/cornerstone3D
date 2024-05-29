import { state } from '../index.js';
import { IToolGroup } from '../../types/index.js';

/**
 * Given a tool group Id, return the tool group
 * @param toolGroupId - The Id of the tool group to be retrieved.
 * @returns The tool group that has the same id as the tool group id that was
 * passed in.
 */
function getToolGroup(toolGroupId: string): IToolGroup | undefined {
  return state.toolGroups.find((s) => s.id === toolGroupId);
}

export default getToolGroup;
