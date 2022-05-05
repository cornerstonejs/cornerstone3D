import { StyleSpecifier } from '../../../types/AnnotationStyle';
import { ToolModes, AnnotationStyleStates } from '../../../enums';
import toolStyle from './ToolStyle';

/**
 * Build a list of hierarchal property names in ascending order of priority
 * @param property - The base property name -- e.g., 'color'
 * @param state - An optional state to determine the final property name
 * @param mode - An optional mode to determine the final property name
 * @returns A list of property names
 */
function getHierarchalPropertyStyles(
  property: string,
  state?: AnnotationStyleStates,
  mode?: ToolModes
): string[] {
  const list = [`${property}`];
  if (state) list.push(`${list[0]}${state}`);
  if (mode) list.push(`${list[list.length - 1]}${mode}`);
  return list;
}

/**
 * Get the value of a style property from the ToolStyle config
 * @param property - The name of the property to get.
 * @param styleSpecifier - An object containing the specifications such as viewportId,
 * toolGroupId, toolName and annotationUID which are used to get the style if the level of specificity is
 * met (hierarchy is checked from most specific to least specific which is
 * annotationLevel -> viewportLevel -> toolGroupLevel -> default.
 * @param state - The state of the tool (Default, Locked etc.)
 * @param mode - The current tool mode. (Active, Passive etc.)
 * @returns The value of the property.
 */
function getStyleProperty(
  property: string,
  styleSpecifier: StyleSpecifier,
  state?: AnnotationStyleStates,
  mode?: ToolModes
): string {
  // Hierarchal property styles is a list of property names with priority in ascending
  // order like: ['color', 'colorSelected', 'colorSelectedActive'], if in the toolStyle
  // config, the `colorSelectedActive` property is defined, it will be used, otherwise
  // the `colorSelected` property will be used, and if that is not defined, the `color`
  // property will be used. This is done to ensure that the most specific property is used.
  // Thus, we attempt resolving property names in reverse order
  const alternatives = getHierarchalPropertyStyles(property, state, mode);
  for (let i = alternatives.length - 1; i >= 0; --i) {
    const style = toolStyle.getStyleProperty(alternatives[i], styleSpecifier);
    if (style !== undefined) {
      return style;
    }
  }
}

export { getStyleProperty };
