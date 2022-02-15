import { MouseCursor, SVGMouseCursor } from '.'

const ELEMENT_CURSORS_MAP = Symbol('ElementCursorsMap')

/*
 * Public Methods
 */

function initElementCursor(
  element: HTMLElement,
  cursor: MouseCursor | null
): void {
  _getElementCursors(element)[0] = cursor
  _setElementCursor(element, cursor)
}

function _setElementCursor(
  element: HTMLElement,
  cursor: MouseCursor | null
): void {
  const cursors = _getElementCursors(element)
  cursors[1] = cursors[0]
  cursors[0] = cursor
  element.style.cursor = (
    cursor instanceof MouseCursor
      ? cursor
      : MouseCursor.getDefinedCursor('auto')
  ).getStyleProperty()
}

function resetElementCursor(element: HTMLElement): void {
  _setElementCursor(element, _getElementCursors(element)[1])
}

function hideElementCursor(element: HTMLElement): void {
  _setElementCursor(element, MouseCursor.getDefinedCursor('none'))
}

/*
 * Helpers
 */

function _getElementCursors(
  element: HTMLElement
): [MouseCursor | null, MouseCursor | null] {
  let map = _getElementCursors[ELEMENT_CURSORS_MAP]
  if (!(map instanceof WeakMap)) {
    map = new WeakMap()
    Object.defineProperty(_getElementCursors, ELEMENT_CURSORS_MAP, {
      value: map,
    })
  }
  let cursors = map.get(element)
  if (!cursors) {
    cursors = [null, null]
    map.set(element, cursors)
  }
  return cursors
}

/**
 * Set the cursor for an element
 * @param {HTMLElement} element - The element to set the cursor on.
 * @param {string} cursorName - The name of the cursor to set. This can be
 * any cursor name either Cornerstone-specific cursor names or the standard
 * CSS cursor names.
 */
function setCursorForElement(element: HTMLElement, cursorName: string): void {
  let cursor = SVGMouseCursor.getDefinedCursor(cursorName, true)
  if (!cursor) {
    cursor = MouseCursor.getDefinedCursor(cursorName)
  }

  if (!cursor) {
    console.log(
      `Cursor ${cursorName} is not defined either as SVG or as a standard cursor.`
    )
    cursor = MouseCursor.getDefinedCursor(cursorName)
  }

  _setElementCursor(element, cursor)
}

/*
 * Exports
 */

export {
  initElementCursor,
  setCursorForElement,
  resetElementCursor,
  hideElementCursor,
}
