import { ToolModes, AnnotationStyleStates } from '../../../enums';
import { getStyleProperty } from './helpers';
import { StyleSpecifications } from '../../../types/AnnotationStyle';

/**
 * getFont - Returns a font string of the form "{fontSize}px fontName" used by `canvas`.
 * @param styleSpecifications - An object containing the specifications such as viewportId,
 * toolGroupId, toolName and annotationUID which are used to get the style if the level of specificity is
 * met (hierarchy is checked from most specific to least specific which is
 * annotationLevel -> viewportLevel -> toolGroupLevel -> default.
 * @param state - An optional state to determine the final property name
 * @param mode - An optional mode to determine the final property name
 * @returns The font string.
 */
function getFont(
  styleSpecifications: StyleSpecifications,
  state?: AnnotationStyleStates,
  mode?: ToolModes
): string {
  const fontSize = getStyleProperty(
    'textBoxFontSize',
    styleSpecifications,
    state,
    mode
  );
  const fontFamily = getStyleProperty(
    'textBoxFontFamily',
    styleSpecifications,
    state,
    mode
  );

  return `${fontSize}px ${fontFamily}`;
}

export default getFont;
