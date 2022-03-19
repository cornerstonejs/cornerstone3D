import { Settings } from '@precisionmetrics/cornerstone-render'
import state from '../../../store/state'

/**
 * Set the style of an annotation object
 * @param string - toolName - The name of the tool.
 * @param annotation - The annotation object.
 * @param style - The style object to set.
 * @returns A boolean value indicating whether the style was set.
 */
function setAnnotationStyle(
  toolName: string,
  annotation: Record<string, unknown>,
  style: Record<string, unknown>
): boolean {
  const descriptor = state.tools[toolName]
  if (descriptor) {
    const { toolClass } = descriptor
    return Settings.getObjectSettings(annotation, toolClass).set(
      'tool.style',
      style
    )
  }
  return false
}

export default setAnnotationStyle
