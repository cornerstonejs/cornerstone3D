/**
 *  The events for cornerstoneTools3D Tools. Native Mouse and Keyboard events are
 *  captured, normalized, and re-triggered with a `CORNERSTONE_TOOLS` prefix. This
 *  allows us to handle events consistently across different browsers.
 *
 */
enum Events {
  ///////////////////////////////////////
  //            Annotations
  ///////////////////////////////////////

  /**
   * Triggers on the eventTarget when a new annotation is added to the state.
   *
   * Make use of {@link EventTypes.AnnotationAddedEventType | Annotation Added Event Type  }
   * for typing your event listeners for this annotation added event, and see what event
   * detail is included in {@link EventTypes.AnnotationAddedEventDetail | Annotation Added Event Detail}.
   */
  ANNOTATION_ADDED = 'CORNERSTONE_TOOLS_ANNOTATION_ADDED',

  /**
   * Triggers on the eventTarget when a new annotation is completed its drawing
   * Make use of {@link EventTypes.AnnotationCompletedEventType | Annotation Completed Event Type }
   * for typing your event listeners for this annotation completed event, and see what event
   * detail is included in {@link EventTypes.AnnotationCompletedEventDetail | Annotation Completed Event Detail}.
   */
  ANNOTATION_COMPLETED = 'CORNERSTONE_TOOLS_ANNOTATION_COMPLETED',

  /**
   * Triggers on the eventTarget when an annotation is modified (e.g. a handle is modified).
   * Make use of {@link EventTypes.AnnotationModifiedEventType | Annotation Modified Event Type}
   * for typing your event listeners for this annotation modified event, and see what
   * event detail is included in {@link EventTypes.AnnotationModifiedEventDetail | Annotation Modified Event Detail}.
   */
  ANNOTATION_MODIFIED = 'CORNERSTONE_TOOLS_ANNOTATION_MODIFIED',

  /**
   * Triggers on the eventTarget when an annotation is removed from the annotations manager.
   * Make use of {@link EventTypes.AnnotationRemovedEventType | Annotation Removed Event Type}
   * for typing your event listeners for this annotation removed event, and see what
   * event detail is included in {@link EventTypes.AnnotationRemovedEventDetail | Annotation Removed Event Detail}.
   */
  ANNOTATION_REMOVED = 'CORNERSTONE_TOOLS_ANNOTATION_REMOVED',

  /**
   * Triggers on the eventTarget when an annotation selection status is changed.
   * Make use of {@link EventTypes.AnnotationSelectionChangeEventType | Annotation Selection Change Event Type}
   * for typing your event listeners for this annotation selection change event, and see what
   * event detail is included in {@link EventTypes.AnnotationSelectionChangeEventDetail | Annotation Selection Change Event Detail}.
   */
  ANNOTATION_SELECTION_CHANGE = 'CORNERSTONE_TOOLS_ANNOTATION_SELECTION_CHANGE',

  /**
   * Triggers on the eventTarget when an annotation locked status is changed.
   * Make use of {@link EventTypes.AnnotationLockChangeEventType | Annotation Lock Change Event Type}
   * for typing your event listeners for this annotation lock change event, and see what
   * event detail is included in {@link EventTypes.AnnotationLockChangeEventDetail | Annotation Lock Change Event Detail}.
   */
  ANNOTATION_LOCK_CHANGE = 'CORNERSTONE_TOOLS_ANNOTATION_LOCK_CHANGE',

  /**
   * Triggers on the eventTarget when an annotation visible status is changed.
   * Make use of {@link EventTypes.AnnotationVisibilityChangeEventType | Annotation Visible Change Event Type}
   * for typing your event listeners for this annotation Hide change event, and see what
   * event detail is included in {@link EventTypes.AnnotationVisibilityChangeEventDetail | Annotation Visible Change Event Detail}.
   */
  ANNOTATION_VISIBILITY_CHANGE = 'CORNERSTONE_TOOLS_ANNOTATION_VISIBILITY_CHANGE',

  /**
   * Triggers on the eventTarget when an annotation is rendered.
   * Make use of {@link EventTypes.AnnotationRenderedEventType | Annotation Rendered Event Type}
   * for typing your event listeners for this annotation rendered event, and see what
   * event detail is included in {@link EventTypes.AnnotationRenderedEventDetail | Annotation Rendered Event Detail}.
   */
  ANNOTATION_RENDERED = 'CORNERSTONE_TOOLS_ANNOTATION_RENDERED',

  ///////////////////////////////////////
  //        Segmentations Events
  ///////////////////////////////////////

  /**
   * Triggers on the eventTarget when a Segmentation is updated in the state manager.
   * Make use of {@link EventTypes.SegmentationModifiedEventType | Segmentation Modified Event Type}
   * for typing your event listeners for this segmentation modified event, and see what
   * event detail is included in {@link EventTypes.SegmentationModifiedEventDetail | Segmentation Modified Event Detail}.
   */
  SEGMENTATION_MODIFIED = 'CORNERSTONE_TOOLS_SEGMENTATION_MODIFIED',

  /**
   * Triggers on the eventTarget when a Segmentation is rendered by the Segmentation Rendering Engine.
   * Make use of {@link EventTypes.SegmentationRenderedEventType | Segmentation Rendered Event Type}
   * for typing your event listeners for this segmentation rendered event, and see what
   * event detail is included in {@link EventTypes.SegmentationRenderedEventDetail | Segmentation Rendered Event Detail}.
   */
  SEGMENTATION_RENDERED = 'CORNERSTONE_TOOLS_SEGMENTATION_RENDERED',

  /**
   * Triggers on the eventTarget when a Segmentation representation of a toolGroup is modified in the state manager.
   * Make use of {@link EventTypes.SegmentationRepresentationModifiedEventType | Segmentation Representation Modified Event Type}
   * for typing your event listeners for this segmentation representation modified event, and see what
   * event detail is included in {@link EventTypes.SegmentationRepresentationModifiedEventDetail | Segmentation Representation Modified Event Detail}.
   */
  SEGMENTATION_REPRESENTATION_MODIFIED = 'CORNERSTONE_TOOLS_SEGMENTATION_REPRESENTATION_MODIFIED',

  /**
   * Triggers on the eventTarget when a Segmentation is removed from the state manager.
   * Make use of {@link EventTypes.SegmentationRemovedEventType | Segmentation Removed Event Type}
   * for typing your event listeners for this segmentation removed event, and see what
   * event detail is included in {@link EventTypes.SegmentationRemovedEventDetail | Segmentation Removed Event Detail}.
   */
  SEGMENTATION_REMOVED = 'CORNERSTONE_TOOLS_SEGMENTATION_REMOVED',

  /**
   * Triggers on the eventTarget when a Segmentation representation of a toolGroup is removed in the state manager.
   * Make use of {@link EventTypes.SegmentationRepresentationRemovedEventType | Segmentation Representation Removed Event Type}
   * for typing your event listeners for this segmentation representation removed event, and see what
   * event detail is included in {@link EventTypes.SegmentationRepresentationRemovedEventDetail | Segmentation Representation Removed Event Detail}.
   */
  SEGMENTATION_REPRESENTATION_REMOVED = 'CORNERSTONE_TOOLS_SEGMENTATION_REPRESENTATION_REMOVED',

  /**
   * Triggers on the eventTarget when a Segmentation data is modified (e.g., by brush tool).
   * Make use of {@link EventTypes.SegmentationDataModifiedEventType | Segmentation Data Modified Event Type}
   * for typing your event listeners for this segmentation data modified event, and see what
   * event detail is included in {@link EventTypes.SegmentationDataModifiedEventDetail | Segmentation Data Modified Event Detail}.
   */
  SEGMENTATION_DATA_MODIFIED = 'CORNERSTONE_TOOLS_SEGMENTATION_DATA_MODIFIED',

  ///////////////////////////////////////
  //         Keyboard Events
  ///////////////////////////////////////

  /**
   * Triggers on the eventTarget when a key on the keyboard is pressed.
   * Make use of {@link EventTypes.KeyDownEventType | Key Down Event Type}
   * for typing your event listeners for this key down event, and see what
   * event detail is included in {@link EventTypes.KeyDownEventDetail | Key Down Event Detail}.
   */
  KEY_DOWN = 'CORNERSTONE_TOOLS_KEY_DOWN',

  /**
   * Triggers on the eventTarget when a key on the keyboard is released.
   * Make use of {@link EventTypes.KeyUpEventType | Key Up Event Type}
   * for typing your event listeners for this key up event, and see what
   * event detail is included in {@link EventTypes.KeyUpEventDetail | Key Up Event Detail}.
   */
  KEY_UP = 'CORNERSTONE_TOOLS_KEY_UP',

  ///////////////////////////////////////
  //      Mouse Events
  ///////////////////////////////////////

  /**
   * Triggers on the eventTarget when the mouse is pressed down, it is CornerstoneTools normalized event.
   * Make use of {@link EventTypes.MouseDownEventType | Mouse Down Event Type}
   * for typing your event listeners for this mouse down event, and see what
   * event detail is included in {@link EventTypes.MouseDownEventDetail | Mouse Down Event Detail}.
   */
  MOUSE_DOWN = 'CORNERSTONE_TOOLS_MOUSE_DOWN',

  /**
   * Triggers on the eventTarget when the mouse is released, it is CornerstoneTools normalized event.
   * Make use of {@link EventTypes.MouseUpEventType | Mouse Up Event Type}
   * for typing your event listeners for this mouse up event, and see what
   * event detail is included in {@link EventTypes.MouseUpEventDetail | Mouse Up Event Detail}.
   */
  MOUSE_UP = 'CORNERSTONE_TOOLS_MOUSE_UP',

  /**
   * Triggers on the eventTarget when a handled `MOUSE_DOWN` event does not `stopPropagation`. The hook
   * we use to create new annotation for mouse events.
   * Make use of {@link EventTypes.MouseDownActivateEventType | Mouse Down Activate Event Type}
   * for typing your event listeners for this mouse down activate event, and see what
   * event detail is included in {@link EventTypes.MouseDownActivateEventDetail | Mouse Down Activate Event Detail}.
   */
  MOUSE_DOWN_ACTIVATE = 'CORNERSTONE_TOOLS_MOUSE_DOWN_ACTIVATE',

  /**
   * Triggers on the event target when mouse is dragging an annotation or textBox.
   * Make use of {@link EventTypes.MouseDragEventType | Mouse Drag Event Type}
   * for typing your event listeners for this mouse drag event, and see what
   * event detail is included in {@link EventTypes.MouseDragEventDetail | Mouse Drag Event Detail}.
   */
  MOUSE_DRAG = 'CORNERSTONE_TOOLS_MOUSE_DRAG',

  /**
   * Triggers on the eventTarget, when the mouse is moved, it is CornerstoneTools normalized event.
   * It can be just a mouse move or when double click is performed and annotation
   * drawing can be performed with just mouse move.
   * Make use of {@link EventTypes.MouseMoveEventType | Mouse Move Event Type}
   * for typing your event listeners for this mouse move event, and see what
   * event detail is included in {@link EventTypes.MouseMoveEventDetail | Mouse Move Event Detail}.
   */
  MOUSE_MOVE = 'CORNERSTONE_TOOLS_MOUSE_MOVE',

  /**
   * Triggers on the eventTarget when a mouse click is detected. It is CornerstoneTools normalized event.
   * Make use of {@link EventTypes.MouseClickEventType | Mouse Click Event Type}
   * for typing your event listeners for this mouse click event, and see what
   * event detail is included in {@link EventTypes.MouseClickEventDetail | Mouse Click Event Detail}.
   */
  MOUSE_CLICK = 'CORNERSTONE_TOOLS_MOUSE_CLICK',

  /**
   * Triggers on the eventTarget when a mouse double click is detected. It is CornerstoneTools normalized event.
   * Make use of {@link EventTypes.MouseDoubleClickEventType | Mouse Double Click Event Type}
   * for typing your event listeners for this mouse double click event, and see what
   * event detail is included in {@link EventTypes.MouseDoubleClickEventDetail | Mouse Double Click Event Detail}.
   */
  MOUSE_DOUBLE_CLICK = 'CORNERSTONE_TOOLS_MOUSE_DOUBLE_CLICK',

  /**
   * Triggers on the eventTarget when a mouse wheel event is detected. It is CornerstoneTools normalized event.
   * Make use of {@link EventTypes.MouseWheelEventType | Mouse Wheel Event Type}
   * for typing your event listeners for this mouse wheel event, and see what
   * event detail is included in {@link EventTypes.MouseWheelEventDetail | Mouse Wheel Event Detail}.
   */
  MOUSE_WHEEL = 'CORNERSTONE_TOOLS_MOUSE_WHEEL',

  // Todo: not being fired as of now
  // ANNOTATION_COMPLETED = 'CORNERSTONE_TOOLS_ANNOTATION_COMPLETED',
  // Todo: not implemented yet
  // KEY_PRESS = 'CORNERSTONE_TOOLS_KEY_PRESS',

  //////////////////////
  //   Touch Events   //
  //////////////////////
  // The event flow looks like the following
  // Touch Start -> (optional) Touch Press -> Touch Drag -> (optional) Touch Swipe -> Touch End
  // Touch Tap
  // mousedown
  // mousedown, Touch Start, and Tap are mutually exclusive events
  TOUCH_START = 'CORNERSTONE_TOOLS_TOUCH_START',
  TOUCH_START_ACTIVATE = 'CORNERSTONE_TOOLS_TOUCH_START_ACTIVATE',
  TOUCH_PRESS = 'CORNERSTONE_TOOLS_TOUCH_PRESS',
  TOUCH_DRAG = 'CORNERSTONE_TOOLS_TOUCH_DRAG',
  TOUCH_END = 'CORNERSTONE_TOOLS_TOUCH_END',
  TOUCH_TAP = 'CORNERSTONE_TOOLS_TAP',
  TOUCH_SWIPE = 'CORNERSTONE_TOOLS_SWIPE',
}

export default Events;
