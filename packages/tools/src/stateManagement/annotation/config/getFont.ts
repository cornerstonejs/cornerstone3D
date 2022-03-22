import { Settings } from '@cornerstonejs/core'
import { ToolModes, AnnotationStyleStates } from '../../../enums'
import { getStyleProperty } from './annotationStyle'

/**
 * getFont - Returns a font string of the form "{fontSize}px fontName" used by `canvas`.
 * @param settings - An optional Settings instance to read from.
 * @param state - An optional state to determine the final property name
 * @param mode - An optional mode to determine the final property name
 * @returns The font string.
 */
function getFont(
  settings?: Settings,
  state?: AnnotationStyleStates,
  mode?: ToolModes
): string {
  const sty = Settings.assert(settings)
  const fontSize = getStyleProperty(sty, 'textBox.fontSize', state, mode)
  const fontFamily = getStyleProperty(sty, 'textBox.fontFamily', state, mode)
  return `${fontSize}px ${fontFamily}`
}

export default getFont
