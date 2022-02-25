import { state } from '../index'
import { IToolGroup } from '../../types'

function getToolGroup(
  renderingEngineUID: string,
  viewportUID: string
): IToolGroup | undefined {
  const toolGroupFilteredByUIDs = state.toolGroups.filter((tg) =>
    tg.viewportsInfo.some(
      (vp) =>
        vp.renderingEngineUID === renderingEngineUID &&
        (!vp.viewportUID || vp.viewportUID === viewportUID)
    )
  )

  if (!toolGroupFilteredByUIDs.length) {
    return
  }

  if (toolGroupFilteredByUIDs.length > 1) {
    throw new Error(
      `Multiple tool groups found for renderingEngineUID: ${renderingEngineUID} and viewportUID: ${viewportUID}. You should only
      have one tool group per viewport in a renderingEngine.`
    )
  }

  return toolGroupFilteredByUIDs[0]
}

export default getToolGroup
