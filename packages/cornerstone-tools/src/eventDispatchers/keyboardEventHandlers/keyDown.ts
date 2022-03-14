import { ToolGroupManager } from '../../store'
import getActiveToolForKeyboardEvent from '../shared/getActiveToolForKeyboardEvent'
import { KeyDownEventType } from '../../types/EventTypes'

/**
 * KeyDown event listener to handle viewport cursor icon changes
 *
 * @param evt - The KeyboardEvent
 */
export default function keyDown(evt: KeyDownEventType): void {
  // get the active tool given the key and mouse button
  const activeTool = getActiveToolForKeyboardEvent(evt)

  if (!activeTool) {
    return
  }

  const { renderingEngineUID, viewportUID } = evt.detail

  const toolGroup = ToolGroupManager.getToolGroup(
    renderingEngineUID,
    viewportUID
  )

  if (Object.keys(toolGroup.toolOptions).includes(activeTool.name)) {
    toolGroup.resetViewportsCursor({ name: activeTool.name })
  }
}
