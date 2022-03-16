import { Settings } from '@precisionmetrics/cornerstone-render'
import { ToolModes, AnnotationStyleStates } from '../../enums'
import { Annotation } from '../../types'
import { isAnnotationLocked } from './annotationLocking'
import { isAnnotationSelected } from './annotationSelection'
import state from '../../store/state'
/*
 * Initialization
 */

Settings.getDefaultSettings().set('tool.style', {
  color: 'rgb(255, 255, 0)',
  colorHighlighted: 'rgb(0, 255, 0)',
  colorSelected: 'rgb(0, 255, 0)',
  colorLocked: 'rgb(255, 255, 0)',
  lineWidth: '1',
  lineDash: '',
  textBox: {
    fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif',
    fontSize: '14px',
    color: 'rgb(255, 255, 0)',
    colorHighlighted: 'rgb(0, 255, 0)',
    colorSelected: 'rgb(0, 255, 0)',
    colorLocked: 'rgb(255, 255, 0)',
    background: '',
    link: {
      lineWidth: '1',
      lineDash: '2,3',
    },
  },
})

initializeDefaultStyleAlternatives()

/**
 * For each tool style states (Default, Highlighted, Selected, Locked),
 * and each Mode (None, Active, Inactive), it initializes the default
 * settings for the tool style.
 */
function initializeDefaultStyleAlternatives(): void {
  // Todo: why there is an empty string here?
  const modes = ['', ToolModes.Active, ToolModes.Passive]
  const states = [
    AnnotationStyleStates.Default,
    AnnotationStyleStates.Highlighted,
    AnnotationStyleStates.Selected,
    AnnotationStyleStates.Locked,
  ]
  const defaultSettings = Settings.getDefaultSettings()
  defaultSettings.forEach((name: string) => {
    const nameEndsWith = (string) => string.length > 0 && name.endsWith(string)
    if (
      !name.startsWith('tool.style.') ||
      states.some(nameEndsWith) ||
      modes.some(nameEndsWith)
    ) {
      return
    }
    states.forEach((state) => {
      modes.forEach((mode) => {
        const key = `${name}${state}${mode}`
        // Todo: Is the following because of not setting object with undefined or null?
        defaultSettings.set(key, defaultSettings.get(key))
      })
    })
  })
}

/**
 * Build a list of alternative property names in ascending order of priority
 * @param property - The base property name -- e.g., 'color'
 * @param state - An optional state to determine the final property name
 * @param mode - An optional mode to determine the final property name
 * @returns A list of alternative property names
 */
function getStyleAlternatives(
  property: string,
  state?: AnnotationStyleStates,
  mode?: ToolModes
): string[] {
  const list = [`tool.style.${property}`]
  if (state) list.push(`${list[0]}${state}`)
  if (mode) list.push(`${list[list.length - 1]}${mode}`)
  return list
}

/**
 * Get the value of a style property from the settings
 * @param settings - The settings object.
 * @param property - The name of the property to get.
 * @param state - The state of the tool (Default, Locked etc.)
 * @param mode - The current tool mode. (Active, Passive etc.)
 * @returns The value of the property.
 */
function getStyleProperty(
  settings: Settings,
  property: string,
  state?: AnnotationStyleStates,
  mode?: ToolModes
): unknown {
  // `alternatives` is a list of property names with priority in ascending
  // order like: ['color', 'colorSelected', 'colorSelectedActive']
  // Thus, we attempt resolving property names in reverse order
  const alternatives = getStyleAlternatives(property, state, mode)
  for (let i = alternatives.length - 1; i >= 0; --i) {
    const style = settings.get(alternatives[i])
    if (style !== undefined) {
      return style
    }
  }
}

/**
 * Get the default value of a style property
 * @param property - The name of the style property to get.
 * @param state - The state of the tool (Default, Locked etc.)
 * @param mode - The current tool mode. (Active, Passive etc.)
 * @returns The value of the property.
 */
function getDefaultStyleProperty(
  property: string,
  state?: AnnotationStyleStates,
  mode?: ToolModes
): unknown {
  return getStyleProperty(Settings.getRuntimeSettings(), property, state, mode)
}

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

/**
 * Given a Annotation object, return the annotationStyleStates that it
 * should be in based on its data
 * @param annotation - The annotation that we want to style.
 * @returns The state of the annotation whether it is Default, Highlighted, Locked, or Selected.
 */
function getAnnotationStyle(annotation?: Annotation): AnnotationStyleStates {
  if (annotation) {
    if (annotation.data && annotation.highlighted)
      return AnnotationStyleStates.Highlighted
    if (isAnnotationSelected(annotation)) return AnnotationStyleStates.Selected
    if (isAnnotationLocked(annotation)) return AnnotationStyleStates.Locked
  }

  return AnnotationStyleStates.Default
}

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

export {
  initializeDefaultStyleAlternatives,
  getStyleAlternatives,
  getStyleProperty,
  getDefaultStyleProperty,
  getFont,
  // annotation style set/get
  getAnnotationStyle,
  setAnnotationStyle,
}
