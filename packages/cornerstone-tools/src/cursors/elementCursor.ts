import { MouseCursor } from '.'

const ELEMENT_CURSORS_MAP = Symbol('ElementCursorsMap')

/*
 * Public Methods
 */

function initElementCursor(
  element: HTMLElement,
  cursor: MouseCursor | null
): void {
  getElementCursors(element)[0] = cursor
  setElementCursor(element, cursor)
}

function setElementCursor(
  element: HTMLElement,
  cursor: MouseCursor | null
): void {
  const cursors = getElementCursors(element)
  cursors[1] = cursors[0]
  cursors[0] = cursor
  element.style.cursor = (
    cursor instanceof MouseCursor
      ? cursor
      : MouseCursor.getDefinedCursor('auto')
  ).getStyleProperty()
}

function resetElementCursor(element: HTMLElement): void {
  setElementCursor(element, getElementCursors(element)[1])
}

function hideElementCursor(element: HTMLElement): void {
  setElementCursor(element, MouseCursor.getDefinedCursor('none'))
}

/*
 * Helpers
 */

function getElementCursors(
  element: HTMLElement
): [MouseCursor | null, MouseCursor | null] {
  let map = getElementCursors[ELEMENT_CURSORS_MAP]
  if (!(map instanceof WeakMap)) {
    map = new WeakMap()
    Object.defineProperty(getElementCursors, ELEMENT_CURSORS_MAP, {
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

/*
 * Exports
 */

export {
  initElementCursor,
  setElementCursor,
  resetElementCursor,
  hideElementCursor,
}
