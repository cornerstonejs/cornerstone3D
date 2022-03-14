import { resetModifierKey } from '../../eventListeners/keyboard/keyDownListener'
import { ToolGroupManager } from '../../store'
import getActiveToolForKeyboardEvent from '../shared/getActiveToolForKeyboardEvent'
import { KeyDownEventType } from '../../types/EventTypes'

/**
 * KeyDown event listener to handle viewport cursor icon changes
 *
 * @param evt - The KeyboardEvent
 */
export default function keyUp(evt: KeyDownEventType): void {
  // get the active tool for the primary mouse button
  const activeTool = getActiveToolForKeyboardEvent(evt)

  if (!activeTool) {
    return
  }

  const { renderingEngineUID, viewportUID } = evt.detail

  const toolGroup = ToolGroupManager.getToolGroup(
    renderingEngineUID,
    viewportUID
  )

  // Reset the modifier key
  resetModifierKey()

  if (Object.keys(toolGroup.toolOptions).includes(activeTool.name)) {
    toolGroup.resetViewportsCursor({ name: activeTool.name })
  }
}
