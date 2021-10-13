/**
 *  @enum Enumerates the events for cornerstoneTools3D Tools. Native events are captured,
 *  normalized, and re-triggered with a `cornerstoneTools3D` prefix. This allows
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
enum CornerstoneTools3DEvents {
  //
  // Labelmaps
  //
  LABELMAP_STATE_UPDATED = 'cornerstonetoolslabelmapstateupdated',

  //
  // MOUSE
  //
  ANNOTATION_RENDERED = 'cornerstonetools3dannotationrendered',

  /**
   * https://developer.mozilla.org/en-US/docs/Web/Events/mousedown
   *  @type {String}
   */
  MOUSE_DOWN = 'cornerstonetools3dmousedown',

  /**
   * https://developer.mozilla.org/en-US/docs/Web/Events/mouseup
   *  @type {String}
   */
  MOUSE_UP = 'cornerstonetools3dmouseup',

  /**
   * Is fired if a handled `MOUSE_DOWN` event does not `stopPropagation`. The hook
   * we use to create new measurement data for mouse events.
   *  @type {String}
   */
  MOUSE_DOWN_ACTIVATE = 'cornerstonetools3dmousedownactivate',

  /**
   * https://developer.mozilla.org/en-US/docs/Web/Events/drag
   *  @type {String}
   */
  MOUSE_DRAG = 'cornerstonetools3dmousedrag',

  /**
   * https://developer.mozilla.org/en-US/docs/Web/Events/mousemove
   *  @type {String}
   */
  MOUSE_MOVE = 'cornerstonetools3dmousemove',

  /**
   * https://developer.mozilla.org/en-US/docs/Web/Events/click
   *  @type {String}
   */
  MOUSE_CLICK = 'cornerstonetools3dmouseclick',

  /**
   * https://developer.mozilla.org/en-US/docs/Web/Events/dblclick
   *  @type {String}
   */
  MOUSE_DOUBLE_CLICK = 'cornerstonetools3dmousedoubleclick',

  /**
   * https://developer.mozilla.org/en-US/docs/Web/Events/wheel
   *  @type {String}
   */
  MOUSE_WHEEL = 'cornerstonetools3dmousewheel',

  //
  // TOUCH
  //

  /**
   * https://developer.mozilla.org/en-US/docs/Web/Events/touchstart
   *  @type {String}
   */
  TOUCH_START = 'cornerstonetools3dtouchstart',

  /**
   * Is fired if a handled `TOUCH_START` event does not `stopPropagation`. The hook
   * we use to create new measurement data for touch events.
   *  @type {String}
   */
  TOUCH_START_ACTIVE = 'cornerstonetools3dtouchstartactive',

  /**
   *  @type {String}
   */
  TOUCH_END = 'cornerstonetools3dtouchend',

  /**
   *  @type {String}
   */
  TOUCH_DRAG = 'cornerstonetools3dtouchdrag',

  /**
   *  @type {String}
   */
  TOUCH_DRAG_END = 'cornerstonetools3dtouchdragend',

  /**
   * http://hammerjs.github.io/recognizer-pinch/
   *  @type {String}
   */
  TOUCH_PINCH = 'cornerstonetools3dtouchpinch',

  /**
   * http://hammerjs.github.io/recognizer-rotate/
   *  @type {String}
   */
  TOUCH_ROTATE = 'cornerstonetools3dtouchrotate',

  /**
   * http://hammerjs.github.io/recognizer-press/
   *  @type {String}
   */
  TOUCH_PRESS = 'cornerstonetools3dtouchpress',

  /**
   * http://hammerjs.github.io/recognizer-tap/
   *  @type {String}
   */
  TAP = 'cornerstonetools3dtap',

  /**
   *  @type {String}
   */
  DOUBLE_TAP = 'cornerstonetools3ddoubletap',

  /**
   *  @type {String}
   */
  MULTI_TOUCH_START = 'cornerstonetools3dmultitouchstart',

  /**
   *  @type {String}
   */
  MULTI_TOUCH_START_ACTIVE = 'cornerstonetools3dmultitouchstartactive',

  /**
   *  @type {String}
   */
  MULTI_TOUCH_DRAG = 'cornerstonetools3dmultitouchdrag',

  //
  // KEYBOARD
  //

  /**
   * https://developer.mozilla.org/en-US/docs/Web/Events/keydown
   *  @type {String}
   */
  KEY_DOWN = 'cornerstonetools3dkeydown',

  /**
   * https://developer.mozilla.org/en-US/docs/Web/Events/keyup
   *  @type {String}
   */
  KEY_UP = 'cornerstonetools3dkeyup',

  /**
   * https://developer.mozilla.org/en-US/docs/Web/Events/keypress
   *  @type {String}
   */
  KEY_PRESS = 'cornerstonetools3dkeypress',

  //
  // MEASUREMENTS
  //

  /**
   *  @type {String}
   */
  MEASUREMENT_ADDED = 'cornerstonetoolsmeasurementadded',

  /**
   *  @type {String}
   */
  MEASUREMENT_MODIFIED = 'cornerstonetoolsmeasurementmodified',

  /**
   *  @type {String}
   */
  MEASUREMENT_COMPLETED = 'cornerstonetoolsmeasurementcompleted',

  /**
   *  @type {String}
   */
  MEASUREMENT_REMOVED = 'cornerstonetoolsmeasurementremoved',

  MEASUREMENT_SELECTION_CHANGE = 'cornerstonetools3dmeasurementselectionchange',

  //
  // LOCKED TOOL DATA
  //

  LOCKED_TOOL_DATA_CHANGE = 'cornerstonetools3dlockedtooldatachange',
}

export default CornerstoneTools3DEvents
