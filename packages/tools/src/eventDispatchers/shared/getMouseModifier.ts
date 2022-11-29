import { KeyboardBindings as kb } from '../../enums';

/**
 * Gets the mouse modifier key from a mouse event.
 * Supports Shift, Ctrl, Alt, in singly and in combinations of 2
 * Supports Meta singly.
 */
const getMouseModifierKey = (evt) => {
  // The logic is a hard coded key mapping
  if (evt.shiftKey) {
    if (evt.ctrlKey) return kb.ShiftCtrl;
    if (evt.altKey) return kb.ShiftAlt;
    if (evt.metaKey) return kb.ShiftMeta;
    return kb.Shift;
  }
  if (evt.ctrlKey) {
    if (evt.altKey) return kb.CtrlAlt;
    if (evt.metaKey) return kb.CtrlMeta;
    return kb.Ctrl;
  }
  if (evt.altKey) {
    return (evt.metaKey && kb.AltMeta) || kb.Alt;
  }
  if (evt.metaKey) {
    kb.Meta;
  }
  return undefined;
};

export default getMouseModifierKey;
