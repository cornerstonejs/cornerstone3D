import { state } from '../index'
import { IToolGroup } from '../../types'

function getAllToolGroups(): Array<IToolGroup> {
  return state.toolGroups
}

export default getAllToolGroups
