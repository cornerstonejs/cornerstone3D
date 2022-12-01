/**
 * Mouse This enum enumerates the different buttons returned by `.buttons` on the mouse event.
 * These values are used when setting a tool active in a tool group.
 *
 * See also: https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/buttons
 */
enum MouseBindings {
  /** usually the left button */
  Primary = 1,
  /** usually the right button */
  Secondary = 2,
  Primary_And_Secondary = 3,
  /** usually mouse wheel button */
  Auxiliary = 4,
  Primary_And_Auxiliary = 5,
  Secondary_And_Auxiliary = 6,
  Primary_And_Secondary_And_Auxiliary = 7,
  /** usually "Browser Back" button */
  Fourth_Button = 8,
  /** usually "Browser Forward" button */
  Fifth_Button = 16,
}

enum KeyboardBindings {
  Shift = 16,
  Ctrl = 17,
  Alt = 18,
  Meta = 91,
  ShiftCtrl = 1617,
  ShiftAlt = 1618,
  ShiftMeta = 1691,
  CtrlAlt = 1718,
  CtrlMeta = 1791,
  AltMeta = 1891,
}

export { MouseBindings, KeyboardBindings };
