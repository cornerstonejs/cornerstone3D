import { KeyboardBindings as kb } from '../../enums';

/**
 * Gets the mouse modifier key from a mouse event.
 * Supports Shift, Ctrl, Alt, in singly and in combinations of 2
 * Supports Meta singly.
 */
const getMouseModifierKey = (evt) =>
  (evt.shiftKey &&
    ((evt.ctrlKey && kb.ShiftCtrl) ||
      (evt.altKey && kb.ShiftAlt) ||
      kb.Shift)) ||
  (evt.ctrlKey && ((evt.altKey && kb.CtrlAlt) || kb.Ctrl)) ||
  (evt.altKey && kb.Alt) ||
  (evt.metaKey && kb.Meta) ||
  undefined;

export default getMouseModifierKey;
