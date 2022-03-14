/**
 *  The events for cornerstoneTools3D Tools. Native Mouse and Keyboard events are
 *  captured, normalized, and re-triggered with a `CORNERSTONE_TOOLS` prefix. This
 *  allows us to handle events consistently across different browsers.
 *
 */
enum CornerstoneTools3DEvents {
  ///////////////////////////////////////
  //      Measurements - Annotations
  ///////////////////////////////////////

  /**
   * Triggers on the eventTarget when a new measurement is added.
   *
   * Make use of {@link EventTypes.MeasurementAddedEventType | Measurement Added Event Type  }
   * for typing your event listeners for this measurement added event, and see what event
   * detail is included in {@link EventTypes.MeasurementAddedEventData | Measurement Added Event Data}.
   */
  MEASUREMENT_ADDED = 'CORNERSTONE_TOOLS_MEASUREMENT_ADDED',

  /**
   * Triggers on the eventTarget when a measurement is modified (e.g. a handle is modified).
   * Make use of {@link EventTypes.MeasurementModifiedEventType | Measurement Modified Event Type}
   * for typing your event listeners for this measurement modified event, and see what
   * event detail is included in {@link EventTypes.MeasurementModifiedEventData | Measurement Modified Event Data}.
   */
  MEASUREMENT_MODIFIED = 'CORNERSTONE_TOOLS_MEASUREMENT_MODIFIED',

  /**
   * Triggers on the eventTarget when a measurement is removed from the toolState manager.
   * Make use of {@link EventTypes.MeasurementRemovedEventType | Measurement Removed Event Type}
   * for typing your event listeners for this measurement removed event, and see what
   * event detail is included in {@link EventTypes.MeasurementRemovedEventData | Measurement Removed Event Data}.
   */
  MEASUREMENT_REMOVED = 'CORNERSTONE_TOOLS_MEASUREMENT_REMOVED',

  /**
   * Triggers on the eventTarget when a measurement selection status is changed.
   * Make use of {@link EventTypes.MeasurementSelectionChangeEventType | Measurement Selection Change Event Type}
   * for typing your event listeners for this measurement selection change event, and see what
   * event detail is included in {@link EventTypes.MeasurementSelectionChangeEventData | Measurement Selection Change Event Data}.
   */
  MEASUREMENT_SELECTION_CHANGE = 'CORNERSTONE_TOOLS_MEASUREMENT_SELECTION_CHANGE',

  /**
   * Triggers on the eventTarget when a measurement locked status is changed.
   * Make use of {@link EventTypes.MeasurementLockChangeEventType | Measurement Lock Change Event Type}
   * for typing your event listeners for this measurement lock change event, and see what
   * event detail is included in {@link EventTypes.MeasurementLockChangeEventData | Measurement Lock Change Event Data}.
   */
  MEASUREMENT_LOCK_CHANGE = 'CORNERSTONE_TOOLS_MEASUREMENT_LOCK_CHANGE',

  /**
   * Triggers on the eventTarget when an annotation is rendered.
   * Make use of {@link EventTypes.AnnotationRenderedEventType | Annotation Rendered Event Type}
   * for typing your event listeners for this annotation rendered event, and see what
   * event detail is included in {@link EventTypes.AnnotationRenderedEventData | Annotation Rendered Event Data}.
   */
  ANNOTATION_RENDERED = 'CORNERSTONE_TOOLS_ANNOTATION_RENDERED',

  ///////////////////////////////////////
  //        Segmentations Events
  ///////////////////////////////////////

  /**
   * Triggers on the eventTarget when a Segmentation is rendered by the Segmentation Rendering Engine.
   * Make use of {@link EventTypes.SegmentationRenderedEventType | Segmentation Rendered Event Type}
   * for typing your event listeners for this segmentation rendered event, and see what
   * event detail is included in {@link EventTypes.SegmentationRenderedEventData | Segmentation Rendered Event Data}.
   */
  SEGMENTATION_RENDERED = 'CORNERSTONE_TOOLS_SEGMENTATION_RENDERED',

  /**
   * Triggers on the eventTarget when a Segmentation state of a toolGroup is modified in the state manager.
   * Make use of {@link EventTypes.SegmentationStateModifiedEventType | Segmentation State Modified Event Type}
   * for typing your event listeners for this segmentation state modified event, and see what
   * event detail is included in {@link EventTypes.SegmentationStateModifiedEventData | Segmentation State Modified Event Data}.
   */
  SEGMENTATION_STATE_MODIFIED = 'CORNERSTONE_TOOLS_SEGMENTATION_STATE_MODIFIED',

  /**
   * Triggers on the eventTarget when a Segmentation global state is updated in the state manager.
   * Make use of {@link EventTypes.SegmentationGlobalStateModifiedEventType | Segmentation Global State Modified Event Type}
   * for typing your event listeners for this segmentation global state modified event, and see what
   * event detail is included in {@link EventTypes.SegmentationGlobalStateModifiedEventData | Segmentation Global State Modified Event Data}.
   */
  SEGMENTATION_GLOBAL_STATE_MODIFIED = 'CORNERSTONE_TOOLS_SEGMENTATION_GLOBAL_STATE_MODIFIED',

  /**
   * Triggers on the eventTarget when a Segmentation data is modified (e.g., by brush tool).
   * Make use of {@link EventTypes.SegmentationDataModifiedEventType | Segmentation Data Modified Event Type}
   * for typing your event listeners for this segmentation data modified event, and see what
   * event detail is included in {@link EventTypes.SegmentationDataModifiedEventData | Segmentation Data Modified Event Data}.
   */
  SEGMENTATION_DATA_MODIFIED = 'CORNERSTONE_TOOLS_SEGMENTATION_DATA_MODIFIED',

  ///////////////////////////////////////
  //         Keyboard Events
  ///////////////////////////////////////

  /**
   * Triggers on the eventTarget when a key on the keyboard is pressed.
   * Make use of {@link EventTypes.KeyDownEventType | Key Down Event Type}
   * for typing your event listeners for this key down event, and see what
   * event detail is included in {@link EventTypes.KeyDownEventData | Key Down Event Data}.
   */
  KEY_DOWN = 'CORNERSTONE_TOOLS_KEY_DOWN',

  /**
   * Triggers on the eventTarget when a key on the keyboard is released.
   * Make use of {@link EventTypes.KeyUpEventType | Key Up Event Type}
   * for typing your event listeners for this key up event, and see what
   * event detail is included in {@link EventTypes.KeyUpEventData | Key Up Event Data}.
   */
  KEY_UP = 'CORNERSTONE_TOOLS_KEY_UP',

  ///////////////////////////////////////
  //      Mouse Events
  ///////////////////////////////////////

  /**
   * Triggers on the eventTarget when the mouse is pressed down, it is CornerstoneTools normalized event.
   * Make use of {@link EventTypes.MouseDownEventType | Mouse Down Event Type}
   * for typing your event listeners for this mouse down event, and see what
   * event detail is included in {@link EventTypes.MouseDownEventData | Mouse Down Event Data}.
   */
  MOUSE_DOWN = 'CORNERSTONE_TOOLS_MOUSE_DOWN',

  /**
   * Triggers on the eventTarget when the mouse is released, it is CornerstoneTools normalized event.
   * Make use of {@link EventTypes.MouseUpEventType | Mouse Up Event Type}
   * for typing your event listeners for this mouse up event, and see what
   * event detail is included in {@link EventTypes.MouseUpEventData | Mouse Up Event Data}.
   */
  MOUSE_UP = 'CORNERSTONE_TOOLS_MOUSE_UP',

  /**
   * Triggers on the eventTarget when a handled `MOUSE_DOWN` event does not `stopPropagation`. The hook
   * we use to create new measurement data for mouse events.
   * Make use of {@link EventTypes.MouseDownActivateEventType | Mouse Down Activate Event Type}
   * for typing your event listeners for this mouse down activate event, and see what
   * event detail is included in {@link EventTypes.MouseDownActivateEventData | Mouse Down Activate Event Data}.
   */
  MOUSE_DOWN_ACTIVATE = 'CORNERSTONE_TOOLS_MOUSE_DOWN_ACTIVATE',

  /**
   * Triggers on the event target when mouse is dragging an annotation or textBox.
   * Make use of {@link EventTypes.MouseDragEventType | Mouse Drag Event Type}
   * for typing your event listeners for this mouse drag event, and see what
   * event detail is included in {@link EventTypes.MouseDragEventData | Mouse Drag Event Data}.
   */
  MOUSE_DRAG = 'CORNERSTONE_TOOLS_MOUSE_DRAG',

  /**
   * Triggers on the eventTarget, when the mouse is moved, it is CornerstoneTools normalized event.
   * It can be just a mouse move or when double click is performed and measurement
   * drawing can be performed with just mouse move.
   * Make use of {@link EventTypes.MouseMoveEventType | Mouse Move Event Type}
   * for typing your event listeners for this mouse move event, and see what
   * event detail is included in {@link EventTypes.MouseMoveEventData | Mouse Move Event Data}.
   */
  MOUSE_MOVE = 'CORNERSTONE_TOOLS_MOUSE_MOVE',

  /**
   * Triggers on the eventTarget when a mouse click is detected. It is CornerstoneTools normalized event.
   * Make use of {@link EventTypes.MouseClickEventType | Mouse Click Event Type}
   * for typing your event listeners for this mouse click event, and see what
   * event detail is included in {@link EventTypes.MouseClickEventData | Mouse Click Event Data}.
   */
  MOUSE_CLICK = 'CORNERSTONE_TOOLS_MOUSE_CLICK',

  /**
   * Triggers on the eventTarget when a mouse double click is detected. It is CornerstoneTools normalized event.
   * Make use of {@link EventTypes.MouseDoubleClickEventType | Mouse Double Click Event Type}
   * for typing your event listeners for this mouse double click event, and see what
   * event detail is included in {@link EventTypes.MouseDoubleClickEventData | Mouse Double Click Event Data}.
   */
  MOUSE_DOUBLE_CLICK = 'CORNERSTONE_TOOLS_MOUSE_DOUBLE_CLICK',

  /**
   * Triggers on the eventTarget when a mouse wheel event is detected. It is CornerstoneTools normalized event.
   * Make use of {@link EventTypes.MouseWheelEventType | Mouse Wheel Event Type}
   * for typing your event listeners for this mouse wheel event, and see what
   * event detail is included in {@link EventTypes.MouseWheelEventData | Mouse Wheel Event Data}.
   */
  MOUSE_WHEEL = 'CORNERSTONE_TOOLS_MOUSE_WHEEL',

  // Todo: not being fired as of now
  // MEASUREMENT_COMPLETED = 'CORNERSTONE_TOOLS_MEASUREMENT_COMPLETED',
  // Todo: not implemented yet
  // KEY_PRESS = 'CORNERSTONE_TOOLS_KEY_PRESS',

  ///////////////////////////////////////
  //   Touch Events - Not Implemented yet
  ///////////////////////////////////////
  /**
  TOUCH_START = 'CORNERSTONE_TOOLS_TOUCH_START',
  TOUCH_START_ACTIVE = 'CORNERSTONE_TOOLS_TOUCH_START_ACTIVE',
  TOUCH_END = 'CORNERSTONE_TOOLS_TOUCH_END',
  TOUCH_DRAG = 'CORNERSTONE_TOOLS_TOUCH_DRAG',
  TOUCH_DRAG_END = 'CORNERSTONE_TOOLS_TOUCH_DRAG_END',
  // http://hammerjs.github.io/recognizer-pinch/
  TOUCH_PINCH = 'CORNERSTONE_TOOLS_TOUCH_PINCH',
  // http://hammerjs.github.io/recognizer-rotate/
  TOUCH_ROTATE = 'CORNERSTONE_TOOLS_TOUCH_ROTATE',
  // http://hammerjs.github.io/recognizer-press/
  TOUCH_PRESS = 'CORNERSTONE_TOOLS_TOUCH_PRESS',
  // http://hammerjs.github.io/recognizer-tap/
  TAP = 'CORNERSTONE_TOOLS_TAP',
  DOUBLE_TAP = 'CORNERSTONE_TOOLS_DOUBLE_TAP',
  MULTI_TOUCH_START = 'CORNERSTONE_TOOLS_MULTI_TOUCH_START',
  MULTI_TOUCH_START_ACTIVE = 'CORNERSTONE_TOOLS_MULTI_TOUCH_START_ACTIVE',
  MULTI_TOUCH_DRAG = 'CORNERSTONE_TOOLS_MULTI_TOUCH_DRAG',
  */
}

export default CornerstoneTools3DEvents
