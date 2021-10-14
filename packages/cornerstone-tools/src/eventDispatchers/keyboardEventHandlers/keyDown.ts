import { ToolGroupManager } from '../../store'
import getActiveToolForMouseEvent from '../shared/getActiveToolForMouseEvent'

export default function keyDown(evt) {
  // get the active tool for the primary mouse button
  const activeTool = getActiveToolForMouseEvent(evt)

  if (!activeTool) {
    return
  }

  const { renderingEngineUID, sceneUID, viewportUID } = evt.detail

  const toolGroups = ToolGroupManager.getToolGroups(
    renderingEngineUID,
    sceneUID,
    viewportUID
  )

  toolGroups.forEach((toolGroup) => {
    if (Object.keys(toolGroup.toolOptions).includes(activeTool.name)) {
      toolGroup.resetViewportsCursor({ name: activeTool.name })
    }
  })
}
