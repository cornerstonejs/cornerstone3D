let defaultWidth = 1,
  activeWidth = 2

/**
 * @function setToolWidth Sets the tool width used to draw lines.
 * @param {number} width The new width.
 */
function setToolWidth(width: number) {
  defaultWidth = width
}

/**
 * @function getToolWidth Gets the line width used to draw lines.
 * @returns {number} The width.
 */
function getToolWidth(): number {
  return defaultWidth
}

/**
 * @function setActiveWidth Sets the active line width used to draw lines.
 * @param {number} width The new width.
 */
function setActiveWidth(width) {
  activeWidth = width
}

/**
 * @function getActiveWidth Gets the active line width used to draw lines.
 * @returns {number} The width.
 */
function getActiveWidth() {
  return activeWidth
}

const toolStyle = {
  setToolWidth,
  getToolWidth,
  setActiveWidth,
  getActiveWidth,
}

export default toolStyle
