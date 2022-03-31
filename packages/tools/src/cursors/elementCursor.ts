import { MouseCursor } from '.';

const ELEMENT_CURSORS_MAP = Symbol('ElementCursorsMap');

/*
 * Public Methods
 */

function initElementCursor(
  element: HTMLDivElement,
  cursor: MouseCursor | null
): void {
  _getElementCursors(element)[0] = cursor;
  _setElementCursor(element, cursor);
}

function _setElementCursor(
  element: HTMLDivElement,
  cursor: MouseCursor | null
): void {
  const cursors = _getElementCursors(element);
  cursors[1] = cursors[0];
  cursors[0] = cursor;
  element.style.cursor = (
    cursor instanceof MouseCursor
      ? cursor
      : MouseCursor.getDefinedCursor('auto')
  ).getStyleProperty();
}

function resetElementCursor(element: HTMLDivElement): void {
  _setElementCursor(element, _getElementCursors(element)[1]);
}

function hideElementCursor(element: HTMLDivElement): void {
  _setElementCursor(element, MouseCursor.getDefinedCursor('none'));
}

/*
 * Helpers
 */

function _getElementCursors(
  element: HTMLDivElement
): [MouseCursor | null, MouseCursor | null] {
  let map = _getElementCursors[ELEMENT_CURSORS_MAP];
  if (!(map instanceof WeakMap)) {
    map = new WeakMap();
    Object.defineProperty(_getElementCursors, ELEMENT_CURSORS_MAP, {
      value: map,
    });
  }
  let cursors = map.get(element);
  if (!cursors) {
    cursors = [null, null];
    map.set(element, cursors);
  }
  return cursors;
}

/*
 * Exports
 */
export {
  initElementCursor,
  resetElementCursor,
  hideElementCursor,
  _setElementCursor as setElementCursor,
};
