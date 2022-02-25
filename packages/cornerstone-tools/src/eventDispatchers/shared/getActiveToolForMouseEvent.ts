import { ToolGroupManager } from '../../store'
import { ToolModes } from '../../enums'
import { keyEventListener } from '../../eventListeners'

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
  const { renderingEngineUID, viewportUID } = evt.detail
  const mouseEvent = evt.detail.event
  const modifierKey = keyEventListener.getModifierKey()

  const toolGroup = ToolGroupManager.getToolGroup(
    renderingEngineUID,
    viewportUID
  )

  if (!toolGroup) {
    return null
  }

  const toolGroupToolNames = Object.keys(toolGroup.toolOptions)

  for (let j = 0; j < toolGroupToolNames.length; j++) {
    const toolName = toolGroupToolNames[j]
    const tool = toolGroup.toolOptions[toolName]

    // tool has binding that matches the mouse button, if mouseEvent is undefined
    // it uses the primary button
    const correctBinding =
      tool.bindings.length &&
      tool.bindings.some(
        (binding) =>
          binding.mouseButton === (mouseEvent ? mouseEvent.buttons : 1) &&
          binding.modifierKey === modifierKey
      )

    if (tool.mode === Active && correctBinding) {
      return toolGroup.getToolInstance(toolName)
    }
  }
}
