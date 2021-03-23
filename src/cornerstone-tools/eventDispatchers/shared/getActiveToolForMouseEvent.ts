import { ToolGroupManager } from './../../store/index'
import { ToolModes } from './../../enums/index'

const { Active } = ToolModes

/**
 * @function getActiveToolForMouseEvent Iterate tool group tools until we find a tool that has a "ToolBinding"
 * that matches our MouseEvent's `buttons`. It's possible there will be no match (no active tool for that mouse button combination).
 *
 * @param evt The event dispatcher mouse event.
 *
 * @returns {object} tool.
 */
export default function getActiveToolForMouseEvent(evt) {
  const { renderingEngineUID, sceneUID, viewportUID } = evt.detail
  const mouseEvent = evt.detail.event

  const toolGroups = ToolGroupManager.getToolGroups(
    renderingEngineUID,
    sceneUID,
    viewportUID
  )

  for (let i = 0; i < toolGroups.length; i++) {
    const toolGroup = toolGroups[i]
    const toolGroupToolNames = Object.keys(toolGroup.tools)

    for (let j = 0; j < toolGroupToolNames.length; j++) {
      const toolName = toolGroupToolNames[j]
      const tool = toolGroup.tools[toolName]

      if (tool.mode === Active && tool.bindings.includes(mouseEvent.buttons)) {
        // This should be behind some API. Too much knowledge of ToolGroup
        // inner workings leaking out
        return toolGroup._tools[toolName]
      }
    }
  }
}
