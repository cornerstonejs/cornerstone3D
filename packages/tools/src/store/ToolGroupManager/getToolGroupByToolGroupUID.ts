import { state } from '../index'
import { IToolGroup } from '../../types'

/**
 * Given a tool group Id, return the tool group
 * @param toolGroupId - The Id of the tool group to be retrieved.
 * @returns The tool group that has the same uid as the tool group uid that was
 * passed in.
 */
function getToolGroupByToolGroupUID(
  toolGroupId: string
): IToolGroup | undefined {
  return state.toolGroups.find((s) => s.uid === toolGroupId)
}

export default getToolGroupByToolGroupUID
