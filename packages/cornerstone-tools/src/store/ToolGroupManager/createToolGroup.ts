import { state } from '../index'
import ToolGroup from './ToolGroup'
import { IToolGroup } from '../../types'

function createToolGroup(toolGroupUID: string): IToolGroup | undefined {
  // Exit early if ID conflict
  const toolGroupWithIdExists = state.toolGroups.some(
    (tg) => tg.uid === toolGroupUID
  )

  if (toolGroupWithIdExists) {
    console.warn(`'${toolGroupUID}' already exists.`)
    return
  }

  const toolGroup = new ToolGroup(toolGroupUID)

  // Update state
  state.toolGroups.push(toolGroup)

  // Return reference
  return toolGroup
}

export default createToolGroup
