let defaultColor = 'rgb(255, 255, 0)',
  activeColor = 'rgb(0, 255, 0)',
  fillColor = 'transparent';

/**
 * @function setFillColor Sets the fill color for tools that use fill.
 * @param {string} color A css, rgb, rgba or hex color.
 */
function setFillColor(color) {
  fillColor = color;
}

/**
 * @function getFillColor Gets the fill color to fill tools with.
 *
 * @returns {string} color A css, rgb, rgba or hex color.
 */
function getFillColor(): string {
  return fillColor;
}

/**
 * @function setToolColor Sets the tool color for drawing tools in an inactive state.
 * @param {string} color A css, rgb, rgba or hex color.
 */
function setToolColor(color) {
  defaultColor = color;
}

/**
 * @function getToolColor Gets the tool color to draw tools with in an inactive state.
 *
 * @returns {string} color A css, rgb, rgba or hex color.
 */
function getToolColor(): string {
  return defaultColor;
}

/**
 * @function setActiveColor Sets the tool color for drawing tools in an active state.
 * @param {string} color A css, rgb, rgba or hex color.
 */
function setActiveColor(color) {
  activeColor = color;
}

/**
 * @function getActiveColor Gets the tool color to draw tools with in an active state.
 *
 * @returns {string} color A css, rgb, rgba or hex color.
 */
function getActiveColor(): string {
  return activeColor;
}

/**
 * @function getColorIfActive If the `data` has a `color`, returns that color,
 * otherwise returns the active to tool color depending on the `data`'s state.
 *
 * @param {object} data The toolspecific tool data.
 * @returns {string} The color.
 */
function getColorIfActive(data: { color?: string; active?: boolean }): string {
  if (data.color) {
    return data.color;
  }

  return data.active ? activeColor : defaultColor;
}

const toolColors = {
  setFillColor,
  getFillColor,
  setToolColor,
  getToolColor,
  setActiveColor,
  getActiveColor,
  getColorIfActive,
};

export default toolColors;
