function showToolCursor(element) {
  _clearStateAndSetCursor(element, 'initial');
}

function hideToolCursor(element) {
  _clearStateAndSetCursor(element, 'none');
}

function _clearStateAndSetCursor(element, cursorSeting) {
  element.style.cursor = cursorSeting;
}

export { showToolCursor, hideToolCursor };
