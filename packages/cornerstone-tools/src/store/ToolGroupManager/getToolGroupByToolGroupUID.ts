import { state } from '../index'
import { IToolGroup } from '../../types'

function getToolGroupByToolGroupUID(
  toolGroupUID: string
): IToolGroup | undefined {
  return state.toolGroups.find((s) => s.uid === toolGroupUID)
}

export default getToolGroupByToolGroupUID
