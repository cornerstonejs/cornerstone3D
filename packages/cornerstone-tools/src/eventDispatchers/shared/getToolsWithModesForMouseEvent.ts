import { ToolGroupManager } from '../../store'
import { ToolModes } from '../../enums'
import { keyEventListener } from '../../eventListeners'

type ModesFilter = Array<ToolModes>

/**
 * @function getToolsWithModesForMouseEvent Given the event and a filter of modes,
 * find all the tools on the element that are in one of the specified modes.
 * @param {Event} evt The normalized mouseDown event.
 * @param modesFilter An array of entries from the `ToolModes` enum.
 */
export default function getToolsWithModesForMouseEvent(
  evt,
  modesFilter: ModesFilter,
  evtButton?: any
) {
  const modifierKey = keyEventListener.getModifierKey()

  const { renderingEngineUID, sceneUID, viewportUID } = evt.detail
  const toolGroups = ToolGroupManager.getToolGroups(
    renderingEngineUID,
    sceneUID,
    viewportUID
  )

  const enabledTools = []

  for (let i = 0; i < toolGroups.length; i++) {
    const toolGroup = toolGroups[i]
    const toolGroupToolNames = Object.keys(toolGroup.tools)

    for (let j = 0; j < toolGroupToolNames.length; j++) {
      const toolName = toolGroupToolNames[j]
      const tool = toolGroup.tools[toolName]

      // tool has binding that matches the mouse button
      const correctBinding =
        evtButton != null && // not null or undefined
        tool.bindings.length &&
        tool.bindings.some(
          (binding) =>
            binding.mouseButton === evtButton &&
            binding.modifierKey === modifierKey
        )

      if (
        modesFilter.includes(tool.mode) &&
        // Should not filter by event's button
        // or should, and the tool binding includes the event's button
        (!evtButton || correctBinding)
      ) {
        const toolInstance = toolGroup._tools[toolName]
        enabledTools.push(toolInstance)
      }
    }
  }

  return enabledTools
}
