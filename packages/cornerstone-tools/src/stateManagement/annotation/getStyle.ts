import { Settings } from '@precisionmetrics/cornerstone-render'
import state from '../../store/state'

export default function getStyle(
  toolName?: string,
  annotation?: Record<string, unknown>
): Settings {
  if (toolName) {
    const descriptor = state.tools[toolName]
    if (descriptor) {
      const { toolClass } = descriptor
      if (annotation) {
        return Settings.getObjectSettings(annotation, toolClass)
      }
      return Settings.getObjectSettings(toolClass)
    }
  }
  return Settings.getRuntimeSettings()
}
