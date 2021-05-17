import { Settings } from '@ohif/cornerstone-render'
import state from '../store/state'

export default function setToolStyle(
  toolName: string,
  style: Record<string, unknown>
): boolean {
  const descriptor = state.tools[toolName]
  if (descriptor) {
    const { toolClass } = descriptor
    return Settings.getObjectSettings(toolClass).set('tool.style', style)
  }
  return false
}
