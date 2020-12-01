/**
 *  Enumerates the events for VTK.js Tools. Native events are captured,
 *  normalized, and re-triggered with a `vtkjstools` prefix. This allows
 *  us to handle events consistently across different browsers. Event types:
 *
 * - Mouse
 * - Touch
 * - Keyboard
 *
 * Missing:
 *
 * - Pointer
 * - Non-interaction events (measurement removed/added)
 *
 *  @enum {String}
 *  @readonly
 */
enum VtkjsToolsEvents {
  //
  // MOUSE
  //

  /**
   * https://developer.mozilla.org/en-US/docs/Web/Events/mousedown
   *  @type {String}
   */
  MOUSE_DOWN = 'vtkjstoolsmousedown',

  /**
   * https://developer.mozilla.org/en-US/docs/Web/Events/mouseup
   *  @type {String}
   */
  MOUSE_UP = 'vtkjstoolsmouseup',

  /**
   * Is fired if a handled `MOUSE_DOWN` event does not `stopPropagation`. The hook
   * we use to create new measurement data for mouse events.
   *  @type {String}
   */
  MOUSE_DOWN_ACTIVATE = 'vtkjstoolsmousedownactivate',

  /**
   * https://developer.mozilla.org/en-US/docs/Web/Events/drag
   *  @type {String}
   */
  MOUSE_DRAG = 'vtkjstoolsmousedrag',

  /**
   * https://developer.mozilla.org/en-US/docs/Web/Events/mousemove
   *  @type {String}
   */
  MOUSE_MOVE = 'vtkjstoolsmousemove',

  /**
   * https://developer.mozilla.org/en-US/docs/Web/Events/click
   *  @type {String}
   */
  MOUSE_CLICK = 'vtkjstoolsmouseclick',

  /**
   * https://developer.mozilla.org/en-US/docs/Web/Events/dblclick
   *  @type {String}
   */
  MOUSE_DOUBLE_CLICK = 'vtkjstoolsmousedoubleclick',

  /**
   * https://developer.mozilla.org/en-US/docs/Web/Events/wheel
   *  @type {String}
   */
  MOUSE_WHEEL = 'vtkjstoolsmousewheel',

  //
  // TOUCH
  //

  /**
   * https://developer.mozilla.org/en-US/docs/Web/Events/touchstart
   *  @type {String}
   */
  TOUCH_START = 'vtkjstoolstouchstart',

  /**
   * Is fired if a handled `TOUCH_START` event does not `stopPropagation`. The hook
   * we use to create new measurement data for touch events.
   *  @type {String}
   */
  TOUCH_START_ACTIVE = 'vtkjstoolstouchstartactive',

  /**
   *  @type {String}
   */
  TOUCH_END = 'vtkjstoolstouchend',

  /**
   *  @type {String}
   */
  TOUCH_DRAG = 'vtkjstoolstouchdrag',

  /**
   *  @type {String}
   */
  TOUCH_DRAG_END = 'vtkjstoolstouchdragend',

  /**
   * http://hammerjs.github.io/recognizer-pinch/
   *  @type {String}
   */
  TOUCH_PINCH = 'vtkjstoolstouchpinch',

  /**
   * http://hammerjs.github.io/recognizer-rotate/
   *  @type {String}
   */
  TOUCH_ROTATE = 'vtkjstoolstouchrotate',

  /**
   * http://hammerjs.github.io/recognizer-press/
   *  @type {String}
   */
  TOUCH_PRESS = 'vtkjstoolstouchpress',

  /**
   * http://hammerjs.github.io/recognizer-tap/
   *  @type {String}
   */
  TAP = 'vtkjstoolstap',

  /**
   *  @type {String}
   */
  DOUBLE_TAP = 'vtkjstoolsdoubletap',

  /**
   *  @type {String}
   */
  MULTI_TOUCH_START = 'vtkjstoolsmultitouchstart',

  /**
   *  @type {String}
   */
  MULTI_TOUCH_START_ACTIVE = 'vtkjstoolsmultitouchstartactive',

  /**
   *  @type {String}
   */
  MULTI_TOUCH_DRAG = 'vtkjstoolsmultitouchdrag',

  //
  // KEYBOARD
  //

  /**
   * https://developer.mozilla.org/en-US/docs/Web/Events/keydown
   *  @type {String}
   */
  KEY_DOWN = 'vtkjstoolskeydown',

  /**
   * https://developer.mozilla.org/en-US/docs/Web/Events/keyup
   *  @type {String}
   */
  KEY_UP = 'vtkjstoolskeyup',

  /**
   * https://developer.mozilla.org/en-US/docs/Web/Events/keypress
   *  @type {String}
   */
  KEY_PRESS = 'vtkjstoolskeypress',
}

export default VtkjsToolsEvents;
