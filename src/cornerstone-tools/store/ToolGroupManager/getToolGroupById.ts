import { state } from './../index'
import IToolGroup from './IToolGroup'

function getToolGroupById(toolGroupId: string): IToolGroup | void {
  return state.toolGroups.find((s) => s.id === toolGroupId)
}

export default getToolGroupById
