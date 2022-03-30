import { state } from '../index';
import { IToolGroup } from '../../types';

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
