let defaultFontSize = 15,
  defaultFontName = `Arial`,
  defaultBackgroundColor = 'transparent';

/**
 * @function setFont - Sets the font.
 * @param {string} fontName The font name.
 *
 */
function setFontName(fontName) {
  defaultFontName = fontName;
}

/**
 * @function getFontName - Returns a font string of the form "{fontSize}px fontName" used by `canvas`.
 *
 * @returns {string} The font string.
 */
function getFontName(): string {
  return defaultFontName;
}

/**
 * @function setFontSize - Sets the Font size.
 *
 * @param {number} fontSize
 */
function setFontSize(fontSize: number) {
  defaultFontSize = fontSize;
}

/**
 * @function getFontSize - Returns the font size.
 *
 * @returns {number} The current font size.
 */
function getFontSize(): number {
  return defaultFontSize;
}

/**
 * @function getFont - Returns a font string of the form "{fontSize}px fontName" used by `canvas`.
 *
 * @returns {string} The font string.
 */
function getFont(): string {
  return `${defaultFontSize}px ${defaultFontName}`;
}

/**
 * @function setBackgroundColor - Sets the background color of textBoxes.
 *
 * @param {string} backgroundColor A css, rgb, rgba or hex color.
 */
function setBackgroundColor(backgroundColor: string) {
  defaultBackgroundColor = backgroundColor;
}

/**
 * @function getBackgroundColor - Gets the background color of textBoxes.
 *
 * @returns {string} A css, rgb, rgba or hex color.
 */
function getBackgroundColor(): string {
  return defaultBackgroundColor;
}

const textStyle = {
  setFontName,
  getFontName,
  setFontSize,
  getFontSize,
  getFont,
  setBackgroundColor,
  getBackgroundColor,
};

export default textStyle;
