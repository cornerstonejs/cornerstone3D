import { Settings } from '@precisionmetrics/cornerstone-render'
import state from '../store/state'

export default function getStyle(
  toolName?: string,
  toolData?: Record<string, unknown>
): Settings {
  if (toolName) {
    const descriptor = state.tools[toolName]
    if (descriptor) {
      const { toolClass } = descriptor
      if (toolData) {
        return Settings.getObjectSettings(toolData, toolClass)
      }
      return Settings.getObjectSettings(toolClass)
    }
  }
  return Settings.getRuntimeSettings()
}
