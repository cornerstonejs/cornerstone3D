import { resetModifierKey } from '../../eventListeners/keyboard/keyDownListener'
import { ToolGroupManager } from '../../store'
import getActiveToolForMouseEvent from '../shared/getActiveToolForMouseEvent'

export default function keyUp(evt) {
  // get the active tool for the primary mouse button
  const activeTool = getActiveToolForMouseEvent(evt)

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
