import { Settings } from '@ohif/cornerstone-render'
import state from '../store/state'

export default function setToolDataStyle(
  toolName: string,
  toolData: Record<string, unknown>,
  style: Record<string, unknown>
): boolean {
  const descriptor = state.tools[toolName]
  if (descriptor) {
    const { toolClass } = descriptor
    return Settings.getObjectSettings(toolData, toolClass).set(
      'tool.style',
      style
    )
  }
  return false
}
