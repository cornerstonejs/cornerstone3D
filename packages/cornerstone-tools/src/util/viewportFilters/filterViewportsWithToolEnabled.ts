import { ToolGroupManager } from '../../store'
import { ToolModes } from '../../enums'

const { Active, Passive, Enabled } = ToolModes

/**
 * @function filterViewportsWithToolEnabled Given an array of viewports,
 * returns a list of viewports that have the the specified tool enabled.
 *
 * @param {object[]} viewports An array of viewports.
 * @param {string} toolName The name of the tool to filter on.
 *
 * @returns {object[]} A filtered array of viewports.
 */
export default function filterViewportsWithToolEnabled(viewports, toolName) {
  const numViewports = viewports.length

  const viewportsWithToolEnabled = []

  for (let vp = 0; vp < numViewports; vp++) {
    const viewport = viewports[vp]

    const toolGroup = ToolGroupManager.getToolGroup(
      viewport.renderingEngineUID,
      viewport.uid
    )

    const hasTool = _toolGroupHasActiveEnabledOrPassiveTool(toolGroup, toolName)

    if (hasTool) {
      viewportsWithToolEnabled.push(viewport)
    }
  }

  return viewportsWithToolEnabled
}

/**
 * @private @function _toolGroupHasActiveEnabledOrPassiveTool Given a toolgroup,
 * return true if it contains the tool with the given `toolName` and it is
 * active, passive or enabled.
 *
 * @param {object} toolGroup The `toolGroup` to check.
 * @param {string} toolName The name of the tool.
 *
 * @returns {boolean} True if the tool is enabled, passive or active in the `toolGroup`.
 */
function _toolGroupHasActiveEnabledOrPassiveTool(toolGroup, toolName) {
  const { toolOptions } = toolGroup
  const tool = toolOptions[toolName]

  if (!tool) {
    return false
  }

  const toolMode = tool.mode

  return toolMode === Active || toolMode === Passive || toolMode === Enabled
}
