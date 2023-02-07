import { Types } from '@cornerstonejs/core';
import { Annotation } from './AnnotationTypes';
import IPoints from './IPoints';
import ITouchPoints from './ITouchPoints';
import IDistance from './IDistance';
import { Swipe } from '../enums/Touch';

/**
 * The normalized interaction event detail
 */
type NormalizedInteractionEventDetail = {
  /** The normalized event name. */
  eventName: string;
  /** The unique identifier of the rendering engine. */
  renderingEngineId: string;
  /** The unique identifier of the viewport that the event was fired in. */
  viewportId: string;
  /** The camera at the time of the event. */
  camera: Record<string, unknown>;
  /** The element that the event was fired on. */
  element: HTMLDivElement;
};

type MouseCustomEventDetail = NormalizedInteractionEventDetail & {
  /** The original event object. */
  event: Record<string, unknown> | MouseEvent;
};

type TouchCustomEventDetail = NormalizedInteractionEventDetail & {
  /** The original event object. */
  event: Record<string, unknown> | TouchEvent;
};

type MousePointsDetail = {
  /** The starting points of the mouse event. */
  startPoints: IPoints;
  /** The last points of the mouse. */
  lastPoints: IPoints;
  /** The current mouse position. */
  currentPoints: IPoints;
  /** The difference between the current and last points. */
  deltaPoints: IPoints;
};

type TouchPointsDetail = {
  /** The starting points of the touch event. */
  startPoints: ITouchPoints;
  /** The last points of the touch. */
  lastPoints: ITouchPoints;
  /** The current touch position. */
  currentPoints: ITouchPoints;

  startPointsList: ITouchPoints[];
  /** The last points of the touch. */
  lastPointsList: ITouchPoints[];
  /** The current touch position. */
  currentPointsList: ITouchPoints[];

  /** The difference between the current and last points. */
  deltaPoints: IPoints;
  /** The difference between distances between the current and last points. */
  deltaDistance: IDistance;
};

type InteractionEventDetail = NormalizedInteractionEventDetail &
  (MouseCustomEventDetail | TouchCustomEventDetail) &
  (MousePointsDetail | TouchPointsDetail);

type InteractionStartEventDetail = InteractionEventDetail;

type InteractionEndEventDetail = InteractionEventDetail;

/**
 * The data that is passed to the event handler when a new annotation is added
 * to the annotations.
 */
type AnnotationAddedEventDetail = {
  /** unique id of the viewport */
  viewportId: string;
  /** unique id of the rendering engine */
  renderingEngineId: string;
  /** The annotation that is being added to the annotations manager. */
  annotation: Annotation;
};

/**
 * The data that is passed to the event handler when a new annotation is completed
 * drawing on the viewport.
 */
type AnnotationCompletedEventDetail = {
  /** The annotation that is being added to the annotations manager. */
  annotation: Annotation;
};

/**
 * The data that is passed to the event handler when an annotation is modified.
 */
type AnnotationModifiedEventDetail = {
  /** unique id of the viewport */
  viewportId: string;
  /** unique id of the rendering engine */
  renderingEngineId: string;
  /** The annotation that is being added to the annotations manager. */
  annotation: Annotation;
};

/**
 * The data that is passed to the event handler when an annotation is completed drawing.
 */
type AnnotationRemovedEventDetail = {
  /** The annotation that is being added to the annotations manager. */
  annotation: Annotation;
  /** annotationManagerUID */
  annotationManagerUID: string;
};

/**
 * The data that is passed to the event handler when an annotation selection status changes.
 */
type AnnotationSelectionChangeEventDetail = {
  /** AnnotationUID added to the selection */
  added: Array<string>;
  /** AnnotationUID removed from the selection */
  removed: Array<string>;
  /** Updated selection */
  selection: Array<string>;
};

/**
 * The data that is passed to the event handler when an annotation lock status changes.
 */
type AnnotationLockChangeEventDetail = {
  // List of instances changed to locked state by the last operation.
  added: Array<Annotation>;
  // List of instances removed from locked state by the last operation.
  removed: Array<Annotation>;
  // Updated list of currently locked instances
  locked: Array<Annotation>;
};

type AnnotationVisibilityChangeEventDetail = {
  // List of instances uids changed to NOT visible (hidden) state by the last operation.
  lastHidden: Array<string>;
  // List of instances uids removed from Hidden state by the last operation.
  lastVisible: Array<string>;
  // Updated list of currently hidden instances uids
  hidden: Array<string>;
};

/**
 * The data that is passed to the event handler when an annotation selection status changes.
 */
type AnnotationRenderedEventDetail = {
  /** The HTML element that the annotation was rendered on. */
  element: HTMLDivElement;
  /** unique id of the viewport */
  viewportId: string;
  /** unique id of the rendering engine */
  renderingEngineId: string;
};

/**
 * EventDetail for when a Segmentation Data is modified by a tool
 */
type SegmentationDataModifiedEventDetail = {
  /** unique id of the segmentationData */
  segmentationId: string;
  /** array of slice indices in a labelmap which have been modified */
  // TODO: This is labelmap-specific and needs to be a labelmap-specific event
  modifiedSlicesToUse?: number[];
};

/**
 * EventDetail for when a Segmentation is rendered by segmentation rendering engine
 */
type SegmentationRenderedEventDetail = {
  /** unique id of the viewport */
  viewportId: string;
  /** unique id of the toolGroup segmentation belongs to */
  toolGroupId: string;
};

/**
 * EventDetail for when a Segmentation Representation for a toolGroup is modified
 */
type SegmentationRepresentationModifiedEventDetail = {
  /** unique id of the toolGroup */
  toolGroupId: string;
  /** segmentation representationUID */
  segmentationRepresentationUID: string;
};

/**
 * EventDetail for when a Segmentation is removed
 */
type SegmentationRemovedEventDetail = {
  /** the id of the removed segmentation */
  segmentationId: string;
};

/**
 * EventDetail for when a Segmentation Representation is removed
 */
type SegmentationRepresentationRemovedEventDetail = {
  /** unique id of the toolGroup */
  toolGroupId: string;
  /** segmentation representationUID */
  segmentationRepresentationUID: string;
};

/**
 * EventDetail for when a Segmentation Global State is modified
 */
type SegmentationModifiedEventDetail = {
  /** unique id of segmentation (not segmentationData), for volumes (labelMaps) it is volumeId */
  segmentationId: string;
};

/**
 * EventDetail for keyDown event
 */
type KeyDownEventDetail = {
  /** html element */
  element: HTMLDivElement;
  /** unique id of the viewport */
  viewportId: string;
  /** unique id of the rendering engine */
  renderingEngineId: string;
  /** The key that was pressed */
  key: string;
  /** key code */
  keyCode: number;
};

/** EventDetail for keyDown event */
type KeyUpEventDetail = KeyDownEventDetail;

/**
 * EventDetail for mouseDown event
 */
type MouseDownEventDetail = NormalizedInteractionEventDetail &
  MouseCustomEventDetail &
  MousePointsDetail & {
    /** The mouse button that was pressed. */
    mouseButton: number;
  };

/**
 * EventDetail for touchstart event
 */
type TouchStartEventDetail = NormalizedInteractionEventDetail &
  TouchCustomEventDetail &
  TouchPointsDetail;
/**
 * EventDetail for mouseDrag event
 */
type MouseDragEventDetail = NormalizedInteractionEventDetail &
  MouseCustomEventDetail &
  MousePointsDetail & {
    /** The mouse button that was pressed. */
    mouseButton: number;
  };

/**
 * EventDetail for touch drag event
 */
type TouchDragEventDetail = NormalizedInteractionEventDetail &
  TouchCustomEventDetail &
  TouchPointsDetail;

/**
 * EventDetail mouseMove event
 */
type MouseMoveEventDetail = NormalizedInteractionEventDetail &
  MouseCustomEventDetail & {
    /** The current mouse position. */
    currentPoints: IPoints;
  };

/**
 * EventDetail for mouseUp event
 */
type MouseUpEventDetail = NormalizedInteractionEventDetail &
  MouseCustomEventDetail &
  MousePointsDetail & {
    /** The mouse button that was pressed. */
    mouseButton: number;
  };

/**
 * EventDetail for touch end event
 */
type TouchEndEventDetail = NormalizedInteractionEventDetail &
  TouchPointsDetail &
  TouchCustomEventDetail;

/**
 * EventDetail for mouseDown Activate, it is triggered when mouseDown event is fired
 * but stopPropagation is not called, used for creating new annotation
 */
type MouseDownActivateEventDetail = NormalizedInteractionEventDetail &
  MousePointsDetail &
  MouseCustomEventDetail & {
    /** The mouse button that was pressed. */
    mouseButton: number;
  };

/**
 * EventDetail for touchStart Activate, it is triggered when touchStart event is fired
 * but stopPropagation is not called, used for creating new annotation
 */
type TouchStartActivateEventDetail = NormalizedInteractionEventDetail &
  TouchCustomEventDetail &
  TouchPointsDetail;

/**
 * EventDetail mouseClick (a mouse down which is followed by a mouse up)
 */
type MouseClickEventDetail = NormalizedInteractionEventDetail &
  MouseCustomEventDetail &
  MousePointsDetail & {
    /** The mouse button that was pressed. */
    mouseButton: number;
  };

/**
 * EventDetail mouseClick (a mouse down which is followed by a mouse up)
 */
type MouseDoubleClickEventDetail = NormalizedInteractionEventDetail &
  MouseCustomEventDetail &
  MousePointsDetail;

/**
 * EventDetail touchTap (successive taps which do not trigger touchstart)
 */
type TouchTapEventDetail = NormalizedInteractionEventDetail &
  TouchCustomEventDetail & {
    currentPointsList: ITouchPoints[];
    currentPoints: ITouchPoints;
    taps: number;
  };

type TouchSwipeEventDetail = NormalizedInteractionEventDetail &
  TouchCustomEventDetail & {
    /** Swipe direction  */
    swipe: Swipe;
  };

/**
 * EventDetail touchPress (a longer press in the same spot)
 */
type TouchPressEventDetail = NormalizedInteractionEventDetail &
  TouchCustomEventDetail & {
    /** The starting points of the touch event. */
    startPointsList: ITouchPoints[];
    /** The last points of the touch. */
    lastPointsList: ITouchPoints[];
    /** The starting points of the touch event. */
    startPoints: ITouchPoints;
    /** The last points of the touch. */
    lastPoints: ITouchPoints;
  };

/**
 * Mouse Wheel event detail
 */
type MouseWheelEventDetail = NormalizedInteractionEventDetail &
  MouseCustomEventDetail & {
    /** wheel detail */
    detail: Record<string, any>;
    /** wheel information */
    wheel: {
      spinX: number;
      spinY: number;
      pixelX: number;
      pixelY: number;
      direction: number;
    };
    /** Mouse Points */
    points: IPoints;
  };

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
type NormalizedMouseEventType = Types.CustomEventType<MouseCustomEventDetail>;

/**
 * The Normalized mouse event type
 */
type NormalizedTouchEventType = Types.CustomEventType<TouchCustomEventDetail>;

/**
 * The AnnotationAdded event type
 */
type AnnotationAddedEventType =
  Types.CustomEventType<AnnotationAddedEventDetail>;

/**
 * The AnnotationCompleted event type
 */
type AnnotationCompletedEventType =
  Types.CustomEventType<AnnotationCompletedEventDetail>;

/**
 * The AnnotationModified event type
 */
type AnnotationModifiedEventType =
  Types.CustomEventType<AnnotationModifiedEventDetail>;

/**
 * The AnnotationRemoved event type
 */
type AnnotationRemovedEventType =
  Types.CustomEventType<AnnotationRemovedEventDetail>;

/**
 * The AnnotationSelectionChange event type
 */
type AnnotationSelectionChangeEventType =
  Types.CustomEventType<AnnotationSelectionChangeEventDetail>;

/**
 * The AnnotationRendered event type
 */
type AnnotationRenderedEventType =
  Types.CustomEventType<AnnotationRenderedEventDetail>;

/**
 * The AnnotationLockChange event type
 */
type AnnotationLockChangeEventType =
  Types.CustomEventType<AnnotationLockChangeEventDetail>;

/**
 * The AnnotationVisibilityChange event type
 */
type AnnotationVisibilityChangeEventType =
  Types.CustomEventType<AnnotationVisibilityChangeEventDetail>;

/**
 * Event for when SegmentationData is modified
 */
type SegmentationDataModifiedEventType =
  Types.CustomEventType<SegmentationDataModifiedEventDetail>;

/**
 * Event for when Segmentation Representation is modified
 */
type SegmentationRepresentationModifiedEventType =
  Types.CustomEventType<SegmentationRepresentationModifiedEventDetail>;

/**
 * Event for when Segmentation is removed
 */
type SegmentationRemovedEventType =
  Types.CustomEventType<SegmentationRemovedEventDetail>;

/**
 * Event for when Segmentation Representation is modified
 */
type SegmentationRepresentationRemovedEventType =
  Types.CustomEventType<SegmentationRepresentationRemovedEventDetail>;

/**
 * Event for when Segmentation is rendered
 */
type SegmentationRenderedEventType =
  Types.CustomEventType<SegmentationRenderedEventDetail>;

/**
 * Event for when Segmentation Global State is modified
 */
type SegmentationModifiedEventType =
  Types.CustomEventType<SegmentationModifiedEventDetail>;

/**
 * Event for when a key is pressed
 */
type KeyDownEventType = Types.CustomEventType<KeyDownEventDetail>;

/**
 * Event for when a key is released
 */
type KeyUpEventType = Types.CustomEventType<KeyUpEventDetail>;

/**
 * Event for when a mouse button is pressed
 */
type MouseDownEventType = Types.CustomEventType<MouseDownEventDetail>;

/**
 * Event for when a touch is tapped
 */
type TouchTapEventType = Types.CustomEventType<TouchTapEventDetail>;

/**
 * Event for when a touch is swiped
 */
type TouchSwipeEventType = Types.CustomEventType<TouchSwipeEventDetail>;

/**
 * Event for when a touch is long pressed
 */
type TouchPressEventType = Types.CustomEventType<TouchPressEventDetail>;

/**
 * Event for when a touch starts
 */
type TouchStartEventType = Types.CustomEventType<TouchStartEventDetail>;

/**
 * Event for interaction
 */
type InteractionEventType = Types.CustomEventType<InteractionEventDetail>;

/**
 * Event for interaction start
 */
type InteractionStartType = Types.CustomEventType<InteractionStartEventDetail>;

/**
 * Event for interaction end
 */
type InteractionEndType = Types.CustomEventType<InteractionEndEventDetail>;

/**
 * Event for mouse down event
 */
type MouseDownActivateEventType =
  Types.CustomEventType<MouseDownActivateEventDetail>;

/**
 * Event for touch start event
 */
type TouchStartActivateEventType =
  Types.CustomEventType<TouchStartActivateEventDetail>;

/**
 * Event for mouse drag
 */
type MouseDragEventType = Types.CustomEventType<MouseDragEventDetail>;

/**
 * Event for touch drag
 */
type TouchDragEventType = Types.CustomEventType<TouchDragEventDetail>;

/**
 * Event for mouse up
 */
type MouseUpEventType = Types.CustomEventType<MouseUpEventDetail>;

/**
 * Event for touch end
 */
type TouchEndEventType = Types.CustomEventType<TouchEndEventDetail>;

/**
 * Event for mouse click
 */
type MouseClickEventType = Types.CustomEventType<MouseClickEventDetail>;

/**
 * Event for mouse move
 */
type MouseMoveEventType = Types.CustomEventType<MouseMoveEventDetail>;

/**
 * Event for mouse double click
 */
type MouseDoubleClickEventType =
  Types.CustomEventType<MouseDoubleClickEventDetail>;

/**
 * Event for mouse wheel
 */
type MouseWheelEventType = Types.CustomEventType<MouseWheelEventDetail>;

export {
  InteractionStartType,
  InteractionEndType,
  InteractionEventType,
  NormalizedInteractionEventDetail,
  NormalizedMouseEventType,
  NormalizedTouchEventType,
  AnnotationAddedEventDetail,
  AnnotationAddedEventType,
  AnnotationCompletedEventDetail,
  AnnotationCompletedEventType,
  AnnotationModifiedEventDetail,
  AnnotationModifiedEventType,
  AnnotationRemovedEventDetail,
  AnnotationRemovedEventType,
  AnnotationSelectionChangeEventDetail,
  AnnotationSelectionChangeEventType,
  AnnotationRenderedEventDetail,
  AnnotationRenderedEventType,
  AnnotationLockChangeEventDetail,
  AnnotationVisibilityChangeEventDetail,
  AnnotationLockChangeEventType,
  AnnotationVisibilityChangeEventType,
  SegmentationDataModifiedEventType,
  SegmentationRepresentationModifiedEventDetail,
  SegmentationRepresentationModifiedEventType,
  SegmentationRepresentationRemovedEventDetail,
  SegmentationRepresentationRemovedEventType,
  SegmentationRemovedEventType,
  SegmentationRemovedEventDetail,
  SegmentationDataModifiedEventDetail,
  SegmentationRenderedEventType,
  SegmentationRenderedEventDetail,
  SegmentationModifiedEventType,
  SegmentationModifiedEventDetail,
  KeyDownEventDetail,
  KeyDownEventType,
  KeyUpEventDetail,
  KeyUpEventType,
  MouseDownEventDetail,
  TouchStartEventDetail,
  MouseDownEventType,
  TouchStartEventType,
  MouseDownActivateEventDetail,
  TouchStartActivateEventDetail,
  MouseDownActivateEventType,
  TouchStartActivateEventType,
  MouseDragEventDetail,
  TouchDragEventDetail,
  MouseDragEventType,
  TouchDragEventType,
  MouseUpEventDetail,
  TouchEndEventDetail,
  MouseUpEventType,
  TouchEndEventType,
  MouseClickEventDetail,
  MouseClickEventType,
  TouchTapEventDetail,
  TouchTapEventType,
  TouchSwipeEventDetail,
  TouchSwipeEventType,
  TouchPressEventDetail,
  TouchPressEventType,
  MouseMoveEventDetail,
  MouseMoveEventType,
  MouseDoubleClickEventDetail,
  MouseDoubleClickEventType,
  MouseWheelEventDetail,
  MouseWheelEventType,
};
