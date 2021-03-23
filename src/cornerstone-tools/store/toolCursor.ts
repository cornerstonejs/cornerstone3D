/**
 * @function showToolCursor Shows the mouse cursor for the cornerstone3D enabled element.
 *
 * @param {HTMLElement} element The cornerstone3D enabled element.
 */
function showToolCursor(element: HTMLElement) {
  _setCursorStyle(element, 'initial')
}

/**
 * @function hideToolCursor Hides the mouse cursor for the cornerstone3D enabled element.
 *
 * @param {HTMLElement} element The cornerstone3D enabled element.
 */
function hideToolCursor(element: HTMLElement) {
  _setCursorStyle(element, 'none')
}

/**
 * @function _setCursorStyle  Sets the cursorStyle for the element.
 *
 * @param {HTMLElement} element The HTMLElement.
 * @param {string} cursorStyle The `style.cursor` property to set on the `element`.
 */
function _setCursorStyle(element, cursorStyle) {
  element.style.cursor = cursorStyle
}

export { showToolCursor, hideToolCursor }
