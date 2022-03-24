import { Types } from '@cornerstonejs/core'
import { Annotation } from './AnnotationTypes'
import IPoints from './IPoints'

/**
 * The normalized mouse event detail
 */
type NormalizedMouseEventDetail = {
  /** The original event object. */
  event: Record<string, unknown> | MouseEvent
  /** The normalized event name. */
  eventName: string
  /** The unique identifier of the rendering engine. */
  renderingEngineId: string
  /** The unique identifier of the viewport that the event was fired in. */
  viewportId: string
  /** The camera at the time of the event. */
  camera: Record<string, unknown>
  /** The element that the event was fired on. */
  element: HTMLElement
}

/**
 * The data that is passed to the event handler when a new annotation is added
 * to the annotations.
 */
type AnnotationAddedEventDetail = {
  /** unique id of the viewport */
  viewportId: string
  /** unique id of the rendering engine */
  renderingEngineId: string
  /** The annotation that is being added to the annotations manager. */
  annotation: Annotation
}

/**
 * The data that is passed to the event handler when an annotation is modified.
 */
type AnnotationModifiedEventDetail = {
  /** unique id of the viewport */
  viewportId: string
  /** unique id of the rendering engine */
  renderingEngineId: string
  /** The annotation that is being added to the annotations manager. */
  annotation: Annotation
}

/**
 * The data that is passed to the event handler when an annotation is completed drawing.
 */
type AnnotationRemovedEventDetail = {
  /** unique id of the viewport */
  viewportId: string
  /** unique id of the rendering engine */
  renderingEngineId: string
  /** The annotation that is being added to the annotations manager. */
  annotation: Annotation
}

/**
 * The data that is passed to the event handler when an annotation selection status changes.
 */
type AnnotationSelectionChangeEventDetail = {
  /** Annotation added to the selection */
  added: Array<Annotation>
  /** Annotation removed from the selection */
  removed: Array<Annotation>
  /** Updated selection */
  selection: Array<Annotation>
}

/**
 * The data that is passed to the event handler when an annotation lock status changes.
 */
type AnnotationLockChangeEventDetail = {
  // List of instances changed to locked state by the last operation.
  added: Array<Annotation>
  // List of instances removed from locked state by the last operation.
  removed: Array<Annotation>
  // Updated list of currently locked instances
  locked: Array<Annotation>
}

/**
 * The data that is passed to the event handler when an annotation selection status changes.
 */
type AnnotationRenderedEventDetail = {
  /** The HTML element that the annotation was rendered on. */
  element: HTMLElement
  /** unique id of the viewport */
  viewportId: string
  /** unique id of the rendering engine */
  renderingEngineId: string
}

/**
 * EventDetail for when a Segmentation Data is modified by a tool
 */
type SegmentationDataModifiedEventDetail = {
  /** unique id of the toolGroup */
  toolGroupId: string
  /** unique id of the segmentationData */
  segmentationDataUID: string
}

/**
 * EventDetail for when a Segmentation is rendered by segmentation rendering engine
 */
type SegmentationRenderedEventDetail = {
  /** unique id of the viewport */
  viewportId: string
  /** unique id of the toolGroup segmentation belongs to */
  toolGroupId: string
}

/**
 * EventDetail for when a Segmentation State for a toolGroup is modified
 */
type SegmentationStateModifiedEventDetail = {
  /** unique id of the toolGroup */
  toolGroupId: string
}

/**
 * EventDetail for when a Segmentation Global State is modified
 */
type SegmentationGlobalStateModifiedEventDetail = {
  /** unique id of segmentation (not segmentationData), for volumes (labelMaps) it is volumeId */
  segmentationUID: string
}

/**
 * EventDetail for keyDown event
 */
type KeyDownEventDetail = {
  /** html element */
  element: HTMLElement
  /** unique id of the viewport */
  viewportId: string
  /** unique id of the rendering engine */
  renderingEngineId: string
  /** The key that was pressed */
  key: string
  /** key code */
  keyCode: number
}

/** EventDetail for keyDown event */
type KeyUpEventDetail = KeyDownEventDetail

/**
 * EventDetail for mouseDown event
 */
type MouseDownEventDetail = NormalizedMouseEventDetail & {
  /** The mouse button that was pressed. */
  mouseButton: number
  /** The starting points of the mouse event. */
  startPoints: IPoints
  /** The last points of the mouse. */
  lastPoints: IPoints
  /** The current mouse position. */
  currentPoints: IPoints
  /** The difference between the current and last points. */
  deltaPoints: IPoints
}

/**
 * EventDetail for mouseDrag event
 */
type MouseDragEventDetail = NormalizedMouseEventDetail & {
  /** The mouse button that was pressed. */
  mouseButton: number
  /** The starting points of the mouse event. */
  startPoints: IPoints
  /** The last points of the mouse. */
  lastPoints: IPoints
  /** The current mouse position. */
  currentPoints: IPoints
  /** The difference between the current and last points. */
  deltaPoints: IPoints
}

/**
 * EventDetail mouseMove event
 */
type MouseMoveEventDetail = NormalizedMouseEventDetail & {
  /** The current mouse position. */
  currentPoints: IPoints
}

/**
 * EventDetail for mouseUp event
 */
type MouseUpEventDetail = NormalizedMouseEventDetail & {
  /** The mouse button that was pressed. */
  mouseButton: number
  /** The starting points of the mouse event. */
  startPoints: IPoints
  /** The last points of the mouse. */
  lastPoints: IPoints
  /** The current mouse position. */
  currentPoints: IPoints
  /** The difference between the current and last points. */
  deltaPoints: IPoints
}

/**
 * EventDetail for mouseDown Activate, it is triggered when mouseDown event is fired
 * but stopPropagation is not called, used for creating new annotation
 */
type MouseDownActivateEventDetail = NormalizedMouseEventDetail & {
  /** The mouse button that was pressed. */
  mouseButton: number
  /** The starting points of the mouse event. */
  startPoints: IPoints
  /** The last points of the mouse. */
  lastPoints: IPoints
  /** The current mouse position. */
  currentPoints: IPoints
  /** The difference between the current and last points. */
  deltaPoints: IPoints
}

/**
 * EventDetail mouseClick (a mouse down which is followed by a mouse up)
 */
type MouseClickEventDetail = NormalizedMouseEventDetail & {
  /** The mouse button that was pressed. */
  mouseButton: number
  /** The starting points of the mouse event. */
  startPoints: IPoints
  /** The last points of the mouse. */
  lastPoints: IPoints
  /** The current mouse position. */
  currentPoints: IPoints
  /** The difference between the current and last points. */
  deltaPoints: IPoints
}

/**
 * EventDetail mouseClick (a mouse down which is followed by a mouse up)
 */
type MouseDoubleClickEventDetail = NormalizedMouseEventDetail & {
  /** The starting points of the mouse event. */
  startPoints: IPoints
  /** The last points of the mouse. */
  lastPoints: IPoints
  /** The current mouse position. */
  currentPoints: IPoints
  /** The difference between the current and last points. */
  deltaPoints: IPoints
}

/**
 * Mouse Wheel event detail
 */
type MouseWheelEventDetail = NormalizedMouseEventDetail & {
  /** wheel detail */
  detail: Record<string, any>
  /** wheel information */
  wheel: {
    spinX: number
    spinY: number
    pixelX: number
    pixelY: number
    direction: number
  }
  /** Mouse Points */
  points: IPoints
}

/////////////////////////////
//
//
//     Event Types
//
//
/////////////////////////////

/**
 * The Normalized mouse event type
 */
type NormalizedMouseEventType =
  Types.CustomEventType<NormalizedMouseEventDetail>

/**
 * The AnnotationAdded event type
 */
type AnnotationAddedEventType =
  Types.CustomEventType<AnnotationAddedEventDetail>

/**
 * The AnnotationModified event type
 */
type AnnotationModifiedEventType =
  Types.CustomEventType<AnnotationModifiedEventDetail>

/**
 * The AnnotationRemoved event type
 */
type AnnotationRemovedEventType =
  Types.CustomEventType<AnnotationRemovedEventDetail>

/**
 * The AnnotationSelectionChange event type
 */
type AnnotationSelectionChangeEventType =
  Types.CustomEventType<AnnotationSelectionChangeEventDetail>

/**
 * The AnnotationRendered event type
 */
type AnnotationRenderedEventType =
  Types.CustomEventType<AnnotationRenderedEventDetail>

/**
 * The AnnotationLockChange event type
 */
type AnnotationLockChangeEventType =
  Types.CustomEventType<AnnotationLockChangeEventDetail>

/**
 * Event for when SegmentationData is modified
 */
type SegmentationDataModifiedEventType =
  Types.CustomEventType<SegmentationDataModifiedEventDetail>

/**
 * Event for when SegmentationState is modified
 */
type SegmentationStateModifiedEventType =
  Types.CustomEventType<SegmentationStateModifiedEventDetail>

/**
 * Event for when Segmentation is rendered
 */
type SegmentationRenderedEventType =
  Types.CustomEventType<SegmentationRenderedEventDetail>

/**
 * Event for when Segmentation Global State is modified
 */
type SegmentationGlobalStateModifiedEventType =
  Types.CustomEventType<SegmentationGlobalStateModifiedEventDetail>

/**
 * Event for when a key is pressed
 */
type KeyDownEventType = Types.CustomEventType<KeyDownEventDetail>

/**
 * Event for when a key is released
 */
type KeyUpEventType = Types.CustomEventType<KeyUpEventDetail>

/**
 * Event for when a mouse button is pressed
 */
type MouseDownEventType = Types.CustomEventType<MouseDownEventDetail>

/**
 * Event for mouse down event
 */
type MouseDownActivateEventType =
  Types.CustomEventType<MouseDownActivateEventDetail>

/**
 * Event for mouse drag
 */
type MouseDragEventType = Types.CustomEventType<MouseDragEventDetail>

/**
 * Event for mouse up
 */
type MouseUpEventType = Types.CustomEventType<MouseUpEventDetail>

/**
 * Event for mouse click
 */
type MouseClickEventType = Types.CustomEventType<MouseClickEventDetail>

/**
 * Event for mouse move
 */
type MouseMoveEventType = Types.CustomEventType<MouseMoveEventDetail>

/**
 * Event for mouse double click
 */
type MouseDoubleClickEventType =
  Types.CustomEventType<MouseDoubleClickEventDetail>

/**
 * Event for mouse wheel
 */
type MouseWheelEventType = Types.CustomEventType<MouseWheelEventDetail>

export {
  NormalizedMouseEventDetail,
  NormalizedMouseEventType,
  AnnotationAddedEventDetail,
  AnnotationAddedEventType,
  AnnotationModifiedEventDetail,
  AnnotationModifiedEventType,
  AnnotationRemovedEventDetail,
  AnnotationRemovedEventType,
  AnnotationSelectionChangeEventDetail,
  AnnotationSelectionChangeEventType,
  AnnotationRenderedEventDetail,
  AnnotationRenderedEventType,
  AnnotationLockChangeEventDetail,
  AnnotationLockChangeEventType,
  SegmentationDataModifiedEventType,
  SegmentationStateModifiedEventDetail,
  SegmentationStateModifiedEventType,
  SegmentationDataModifiedEventDetail,
  SegmentationRenderedEventType,
  SegmentationRenderedEventDetail,
  SegmentationGlobalStateModifiedEventType,
  SegmentationGlobalStateModifiedEventDetail,
  KeyDownEventDetail,
  KeyDownEventType,
  KeyUpEventDetail,
  KeyUpEventType,
  MouseDownEventDetail,
  MouseDownEventType,
  MouseDownActivateEventDetail,
  MouseDownActivateEventType,
  MouseDragEventDetail,
  MouseDragEventType,
  MouseUpEventDetail,
  MouseUpEventType,
  MouseClickEventDetail,
  MouseClickEventType,
  MouseMoveEventDetail,
  MouseMoveEventType,
  MouseDoubleClickEventDetail,
  MouseDoubleClickEventType,
  MouseWheelEventDetail,
  MouseWheelEventType,
}
