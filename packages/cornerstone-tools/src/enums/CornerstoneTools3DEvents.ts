/**
 *  The events for cornerstoneTools3D Tools. Native events are captured,
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
// Todo: add documentation. I'll add it after we finalize the API.
enum CornerstoneTools3DEvents {
  /**
   *  @type {String}
   */
  MEASUREMENT_ADDED = 'CORNERSTONE_TOOLS_MEASUREMENT_ADDED',

  /**
   *  @type {String}
   */
  MEASUREMENT_MODIFIED = 'CORNERSTONE_TOOLS_MEASUREMENT_MODIFIED',

  /**
   *  @type {String}
   */
  MEASUREMENT_COMPLETED = 'CORNERSTONE_TOOLS_MEASUREMENT_COMPLETED',

  /**
   *  @type {String}
   */
  MEASUREMENT_REMOVED = 'CORNERSTONE_TOOLS_MEASUREMENT_REMOVED',

  MEASUREMENT_SELECTION_CHANGE = 'CORNERSTONE_TOOLS_MEASUREMENT_SELECTION_CHANGE',

  ANNOTATION_RENDERED = 'CORNERSTONE_TOOLS_ANNOTATION_RENDERED',

  LOCKED_TOOL_DATA_CHANGE = 'CORNERSTONE_TOOLS_LOCKED_TOOL_DATA_CHANGE',

  //
  // segmentation display
  //
  SEGMENTATION_RENDERED = 'CORNERSTONE_TOOLS_SEGMENTATION_RENDERED',
  //
  // segmentation state
  //
  SEGMENTATION_STATE_MODIFIED = 'CORNERSTONE_TOOLS_SEGMENTATION_STATE_MODIFIED',
  //
  // segmentation global state
  //
  SEGMENTATION_GLOBAL_STATE_MODIFIED = 'CORNERSTONE_TOOLS_SEGMENTATION_GLOBAL_STATE_MODIFIED',
  //
  // segmentation data modified
  //
  SEGMENTATION_DATA_MODIFIED = 'CORNERSTONE_TOOLS_SEGMENTATION_DATA_MODIFIED',
  //
  //
  // KEYBOARD
  //
  //
  /**
   * https://developer.mozilla.org/en-US/docs/Web/Events/keydown
   *  @type {String}
   */
  KEY_DOWN = 'CORNERSTONE_TOOLS_KEY_DOWN',

  /**
   * https://developer.mozilla.org/en-US/docs/Web/Events/keyup
   *  @type {String}
   */
  KEY_UP = 'CORNERSTONE_TOOLS_KEY_UP',

  /**
   * https://developer.mozilla.org/en-US/docs/Web/Events/keypress
   *  @type {String}
   */
  KEY_PRESS = 'CORNERSTONE_TOOLS_KEY_PRESS',

  /**
   * https://developer.mozilla.org/en-US/docs/Web/Events/mousedown
   *  @type {String}
   */
  MOUSE_DOWN = 'CORNERSTONE_TOOLS_MOUSE_DOWN',

  /**
   * https://developer.mozilla.org/en-US/docs/Web/Events/mouseup
   *  @type {String}
   */
  MOUSE_UP = 'CORNERSTONE_TOOLS_MOUSE_UP',

  /**
   * Is fired if a handled `MOUSE_DOWN` event does not `stopPropagation`. The hook
   * we use to create new measurement data for mouse events.
   *  @type {String}
   */
  MOUSE_DOWN_ACTIVATE = 'CORNERSTONE_TOOLS_MOUSE_DOWN_ACTIVATE',

  /**
   * https://developer.mozilla.org/en-US/docs/Web/Events/drag
   *  @type {String}
   */
  MOUSE_DRAG = 'CORNERSTONE_TOOLS_MOUSE_DRAG',

  /**
   * https://developer.mozilla.org/en-US/docs/Web/Events/mousemove
   *  @type {String}
   */
  MOUSE_MOVE = 'CORNERSTONE_TOOLS_MOUSE_MOVE',

  /**
   * https://developer.mozilla.org/en-US/docs/Web/Events/click
   *  @type {String}
   */
  MOUSE_CLICK = 'CORNERSTONE_TOOLS_MOUSE_CLICK',

  /**
   * https://developer.mozilla.org/en-US/docs/Web/Events/dblclick
   *  @type {String}
   */
  MOUSE_DOUBLE_CLICK = 'CORNERSTONE_TOOLS_MOUSE_DOUBLE_CLICK',

  /**
   * https://developer.mozilla.org/en-US/docs/Web/Events/wheel
   *  @type {String}
   */
  MOUSE_WHEEL = 'CORNERSTONE_TOOLS_MOUSE_WHEEL',

  //
  // TOUCH
  //

  /**
   * https://developer.mozilla.org/en-US/docs/Web/Events/touchstart
   *  @type {String}
   */
  TOUCH_START = 'CORNERSTONE_TOOLS_TOUCH_START',

  /**
   * Is fired if a handled `TOUCH_START` event does not `stopPropagation`. The hook
   * we use to create new measurement data for touch events.
   *  @type {String}
   */
  TOUCH_START_ACTIVE = 'CORNERSTONE_TOOLS_TOUCH_START_ACTIVE',

  /**
   *  @type {String}
   */
  TOUCH_END = 'CORNERSTONE_TOOLS_TOUCH_END',

  /**
   *  @type {String}
   */
  TOUCH_DRAG = 'CORNERSTONE_TOOLS_TOUCH_DRAG',

  /**
   *  @type {String}
   */
  TOUCH_DRAG_END = 'CORNERSTONE_TOOLS_TOUCH_DRAG_END',

  /**
   * http://hammerjs.github.io/recognizer-pinch/
   *  @type {String}
   */
  TOUCH_PINCH = 'CORNERSTONE_TOOLS_TOUCH_PINCH',

  /**
   * http://hammerjs.github.io/recognizer-rotate/
   *  @type {String}
   */
  TOUCH_ROTATE = 'CORNERSTONE_TOOLS_TOUCH_ROTATE',

  /**
   * http://hammerjs.github.io/recognizer-press/
   *  @type {String}
   */
  TOUCH_PRESS = 'CORNERSTONE_TOOLS_TOUCH_PRESS',

  /**
   * http://hammerjs.github.io/recognizer-tap/
   *  @type {String}
   */
  TAP = 'CORNERSTONE_TOOLS_TAP',

  /**
   *  @type {String}
   */
  DOUBLE_TAP = 'CORNERSTONE_TOOLS_DOUBLE_TAP',

  /**
   *  @type {String}
   */
  MULTI_TOUCH_START = 'CORNERSTONE_TOOLS_MULTI_TOUCH_START',

  /**
   *  @type {String}
   */
  MULTI_TOUCH_START_ACTIVE = 'CORNERSTONE_TOOLS_MULTI_TOUCH_START_ACTIVE',

  /**
   *  @type {String}
   */
  MULTI_TOUCH_DRAG = 'CORNERSTONE_TOOLS_MULTI_TOUCH_DRAG',
}

export default CornerstoneTools3DEvents
