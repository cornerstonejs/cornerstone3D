/**
 * Gets the mouse modifier key from a mouse event.
 * Supports Shift, Ctrl, Alt, in singly and in combinations of 2
 * Supports Meta singly.
 */
const getMouseModifierKey = (evt) => {
  const modifier = {
    shift: evt.shiftKey,
    ctrl: evt.ctrlKey,
    alt: evt.altKey,
    meta: evt.metaKey,
  };
  return modifier;
};

export default getMouseModifierKey;
