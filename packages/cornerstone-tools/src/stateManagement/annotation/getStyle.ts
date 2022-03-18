import { Settings } from '@precisionmetrics/cornerstone-render'
import state from '../../store/state'

/**
 * Get the style for a tool based on provided information.
 *
 * No toolName or annotation provided:
 * - It returns the runtime setting style which applies to all tools.
 *
 * toolName provided:
 * - It returns the object setting for the Tool class
 *
 * toolName and annotation provided:
 * - It returns the object setting for the Tool class AND that specific annotation.
 *
 * @param toolName - The name of the tool.
 * @param annotation - The annotation object that was passed to the
 * @returns A `Settings` object.
 */
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
