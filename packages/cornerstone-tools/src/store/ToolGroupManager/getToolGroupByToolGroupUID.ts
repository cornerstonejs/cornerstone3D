import { state } from '../index'
import { IToolGroup } from '../../types'

/**
 * Given a tool group UID, return the tool group
 * @param toolGroupUID - The UID of the tool group to be retrieved.
 * @returns The tool group that has the same uid as the tool group uid that was
 * passed in.
 */
function getToolGroupByToolGroupUID(
  toolGroupUID: string
): IToolGroup | undefined {
  return state.toolGroups.find((s) => s.uid === toolGroupUID)
}

export default getToolGroupByToolGroupUID
