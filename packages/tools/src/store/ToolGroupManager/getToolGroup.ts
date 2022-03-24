import { state } from '../index'
import { IToolGroup } from '../../types'

/**
 * Given a rendering engine UID and a viewport UID, return the tool group that
 * contains that rendering engine and viewport. Note: A viewport can only be
 * associated with a single tool group. You cannot have a viewport that belongs
 * to multiple tool groups. To achieve so, create a new viewport and a new toolGroup
 * for it. This will not impact memory usage much as the volume textures are
 * shared across all viewports rendering the same image.
 *
 * @param viewportId - The UID of the viewport that the tool is being
 * added to.
 * @param renderingEngineUID - The UID of the rendering engine that the
 * tool group is associated with.
 * @returns A tool group.
 */
function getToolGroup(
  viewportId: string,
  renderingEngineUID: string
): IToolGroup | undefined {
  const toolGroupFilteredByUIDs = state.toolGroups.filter((tg) =>
    tg.viewportsInfo.some(
      (vp) =>
        vp.renderingEngineUID === renderingEngineUID &&
        (!vp.viewportId || vp.viewportId === viewportId)
    )
  )

  if (!toolGroupFilteredByUIDs.length) {
    return
  }

  if (toolGroupFilteredByUIDs.length > 1) {
    throw new Error(
      `Multiple tool groups found for renderingEngineUID: ${renderingEngineUID} and viewportId: ${viewportId}. You should only
      have one tool group per viewport in a renderingEngine.`
    )
  }

  return toolGroupFilteredByUIDs[0]
}

export default getToolGroup
