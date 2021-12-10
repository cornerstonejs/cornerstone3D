import { state } from '../index'
import IToolGroup from './IToolGroup'

function getAllToolGroups(): Array<IToolGroup> {
  return state.toolGroups
}

export default getAllToolGroups
