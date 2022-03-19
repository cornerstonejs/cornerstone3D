import { Settings } from '@precisionmetrics/cornerstone-render'
import state from '../../../store/state'

/**
 * Set the style of a specific tool with the provided toolName
 * @param toolName - The name of the tool.
 * @param style - The style object to set.
 * @returns A boolean indicating whether the style was set correctly or not.
 */
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
