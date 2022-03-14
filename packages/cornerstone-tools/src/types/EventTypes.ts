import { Types } from '@precisionmetrics/cornerstone-render'
import { ToolSpecificToolData } from './toolStateTypes'
import IPoints from './IPoints'

/**
 * The normalized mouse event data
 */
type NormalizedMouseEventData = {
  /** The original event object. */
  event: Record<string, unknown> | MouseEvent
  /** The normalized event name. */
  eventName: string
  /** The unique identifier of the rendering engine. */
  renderingEngineUID: string
  /** The unique identifier of the viewport that the event was fired in. */
  viewportUID: string
  /** The camera at the time of the event. */
  camera: Record<string, unknown>
  /** The element that the event was fired on. */
  element: HTMLElement
}

/**
 * The data that is passed to the event handler when a new measurement is added
 * to the toolState.
 */
type MeasurementAddedEventData = {
  /** uniq id of the viewport */
  viewportUID: string
  /** uniq id of the rendering engine */
  renderingEngineUID: string
  /** The tool data that is being added to the tool state manager. */
  toolData: ToolSpecificToolData
}

/**
 * The data that is passed to the event handler when a measurement is modified.
 */
type MeasurementModifiedEventData = {
  /** uniq id of the viewport */
  viewportUID: string
  /** uniq id of the rendering engine */
  renderingEngineUID: string
  /** The tool data that is being added to the tool state manager. */
  toolData: ToolSpecificToolData
}

/**
 * The data that is passed to the event handler when a measurement is completed drawing.
 */
type MeasurementRemovedEventData = {
  /** uniq id of the viewport */
  viewportUID: string
  /** uniq id of the rendering engine */
  renderingEngineUID: string
  /** The tool data that is being added to the tool state manager. */
  toolData: ToolSpecificToolData
}

/**
 * The data that is passed to the event handler when a measurement selection status changes.
 */
type MeasurementSelectionChangeEventData = {
  /** ToolData added to the selection */
  added: Array<ToolSpecificToolData>
  /** ToolData removed from the selection */
  removed: Array<ToolSpecificToolData>
  /** Updated selection */
  selection: Array<ToolSpecificToolData>
}

/**
 * The data that is passed to the event handler when a measurement lock status changes.
 */
type MeasurementLockChangeEventData = {
  // List of instances changed to locked state by the last operation.
  added: Array<ToolSpecificToolData>
  // List of instances removed from locked state by the last operation.
  removed: Array<ToolSpecificToolData>
  // Updated list of currently locked instances
  locked: Array<ToolSpecificToolData>
}

/**
 * The data that is passed to the event handler when a measurement selection status changes.
 */
type AnnotationRenderedEventData = {
  /** The HTML element that the annotation was rendered on. */
  element: HTMLElement
  /** unique id of the viewport */
  viewportUID: string
  /** unique id of the rendering engine */
  renderingEngineUID: string
}

/**
 * EventData for when a Segmentation Data is modified by a tool
 */
type SegmentationDataModifiedEventData = {
  /** uniq id of the toolGroup */
  toolGroupUID: string
  /** uniq id of the segmentationData */
  segmentationDataUID: string
}

/**
 * EventData for when a Segmentation is rendered by segmentation rendering engine
 */
type SegmentationRenderedEventData = {
  /** uniq id of the viewport */
  viewportUID: string
  /** uniq id of the toolGroup segmentation belongs to */
  toolGroupUID: string
}

/**
 * EventData for when a Segmentation State for a toolGroup is modified
 */
type SegmentationStateModifiedEventData = {
  /** uniq id of the toolGroup */
  toolGroupUID: string
}

/**
 * EventData for when a Segmentation Global State is modified
 */
type SegmentationGlobalStateModifiedEventData = {
  /** uniq id of segmentation (not segmentationData), for volumes (labelMaps) it is volumeUID */
  segmentationUID: string
}

/**
 * EventData for keyDown event
 */
type KeyDownEventData = {
  /** html element */
  element: HTMLElement
  /** uniq id of the viewport */
  viewportUID: string
  /** uniq id of the rendering engine */
  renderingEngineUID: string
  /** The key that was pressed */
  key: string
  /** key code */
  keyCode: number
}

/** EventData for keyDown event */
type KeyUpEventData = KeyDownEventData

/**
 * EventData for mouseDown event
 */
type MouseDownEventData = NormalizedMouseEventData & {
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
 * EventData for mouseDrag event
 */
type MouseDragEventData = NormalizedMouseEventData & {
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
 * EventData mouseMove event
 */
type MouseMoveEventData = NormalizedMouseEventData & {
  /** The current mouse position. */
  currentPoints: IPoints
}

/**
 * EventData for mouseUp event
 */
type MouseUpEventData = NormalizedMouseEventData & {
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
 * EventData for mouseDown Activate, it is triggered when mouseDown event is fired
 * but stopPropagation is not called, used for creating new measurement
 */
type MouseDownActivateEventData = NormalizedMouseEventData & {
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
 * EventData mouseClick (a mouse down which is followed by a mouse up)
 */
type MouseClickEventData = NormalizedMouseEventData & {
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
 * EventData mouseClick (a mouse down which is followed by a mouse up)
 */
type MouseDoubleClickEventData = NormalizedMouseEventData & {
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
 * Mouse Wheel event data
 */
type MouseWheelEventData = NormalizedMouseEventData & {
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
type NormalizedMouseEventType = Types.CustomEventType<NormalizedMouseEventData>

/**
 * The MeasurementAdded event type
 */
type MeasurementAddedEventType =
  Types.CustomEventType<MeasurementAddedEventData>

/**
 * The MeasurementModified event type
 */
type MeasurementModifiedEventType =
  Types.CustomEventType<MeasurementModifiedEventData>

/**
 * The MeasurementRemoved event type
 */
type MeasurementRemovedEventType =
  Types.CustomEventType<MeasurementRemovedEventData>

/**
 * The MeasurementSelectionChange event type
 */
type MeasurementSelectionChangeEventType =
  Types.CustomEventType<MeasurementSelectionChangeEventData>

/**
 * The AnnotationRendered event type
 */
type AnnotationRenderedEventType =
  Types.CustomEventType<AnnotationRenderedEventData>

/**
 * The MeasurementLockChange event type
 */
type MeasurementLockChangeEventType =
  Types.CustomEventType<MeasurementLockChangeEventData>

/**
 * Event for when SegmentationData is modified
 */
type SegmentationDataModifiedEventType =
  Types.CustomEventType<SegmentationDataModifiedEventData>

/**
 * Event for when SegmentationState is modified
 */
type SegmentationStateModifiedEventType =
  Types.CustomEventType<SegmentationStateModifiedEventData>

/**
 * Event for when Segmentation is rendered
 */
type SegmentationRenderedEventType =
  Types.CustomEventType<SegmentationRenderedEventData>

/**
 * Event for when Segmentation Global State is modified
 */
type SegmentationGlobalStateModifiedEventType =
  Types.CustomEventType<SegmentationGlobalStateModifiedEventData>

/**
 * Event for when a key is pressed
 */
type KeyDownEventType = Types.CustomEventType<KeyDownEventData>

/**
 * Event for when a key is released
 */
type KeyUpEventType = Types.CustomEventType<KeyUpEventData>

/**
 * Event for when a mouse button is pressed
 */
type MouseDownEventType = Types.CustomEventType<MouseDownEventData>

/**
 * Event for mouse down event
 */
type MouseDownActivateEventType =
  Types.CustomEventType<MouseDownActivateEventData>

/**
 * Event for mouse drag
 */
type MouseDragEventType = Types.CustomEventType<MouseDragEventData>

/**
 * Event for mouse up
 */
type MouseUpEventType = Types.CustomEventType<MouseUpEventData>

/**
 * Event for mouse click
 */
type MouseClickEventType = Types.CustomEventType<MouseClickEventData>

/**
 * Event for mouse move
 */
type MouseMoveEventType = Types.CustomEventType<MouseMoveEventData>

/**
 * Event for mouse double click
 */
type MouseDoubleClickEventType =
  Types.CustomEventType<MouseDoubleClickEventData>

/**
 * Event for mouse wheel
 */
type MouseWheelEventType = Types.CustomEventType<MouseWheelEventData>

export {
  NormalizedMouseEventData,
  NormalizedMouseEventType,
  MeasurementAddedEventData,
  MeasurementAddedEventType,
  MeasurementModifiedEventData,
  MeasurementModifiedEventType,
  MeasurementRemovedEventData,
  MeasurementRemovedEventType,
  MeasurementSelectionChangeEventData,
  MeasurementSelectionChangeEventType,
  AnnotationRenderedEventData,
  AnnotationRenderedEventType,
  MeasurementLockChangeEventData,
  MeasurementLockChangeEventType,
  SegmentationDataModifiedEventType,
  SegmentationStateModifiedEventData,
  SegmentationStateModifiedEventType,
  SegmentationDataModifiedEventData,
  SegmentationRenderedEventType,
  SegmentationRenderedEventData,
  SegmentationGlobalStateModifiedEventType,
  SegmentationGlobalStateModifiedEventData,
  KeyDownEventData,
  KeyDownEventType,
  KeyUpEventData,
  KeyUpEventType,
  MouseDownEventData,
  MouseDownEventType,
  MouseDownActivateEventData,
  MouseDownActivateEventType,
  MouseDragEventData,
  MouseDragEventType,
  MouseUpEventData,
  MouseUpEventType,
  MouseClickEventData,
  MouseClickEventType,
  MouseMoveEventData,
  MouseMoveEventType,
  MouseDoubleClickEventData,
  MouseDoubleClickEventType,
  MouseWheelEventData,
  MouseWheelEventType,
}
