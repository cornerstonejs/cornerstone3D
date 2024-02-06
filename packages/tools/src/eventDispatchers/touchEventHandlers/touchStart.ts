import { state } from '../../store';
import { ToolModes } from '../../enums';
import { EventTypes } from '../../types';
import {
  ToolAnnotationPair,
  ToolsWithMoveableHandles,
} from '../../types/InternalToolTypes';

import {
  setAnnotationSelected,
  isAnnotationSelected,
} from '../../stateManagement/annotation/annotationSelection';

import { isAnnotationLocked } from '../../stateManagement/annotation/annotationLocking';
import { isAnnotationVisible } from '../../stateManagement/annotation/annotationVisibility';

// Util
import filterToolsWithMoveableHandles from '../../store/filterToolsWithMoveableHandles';
import filterToolsWithAnnotationsForElement from '../../store/filterToolsWithAnnotationsForElement';
import filterMoveableAnnotationTools from '../../store/filterMoveableAnnotationTools';
import getActiveToolForTouchEvent from '../shared/getActiveToolForTouchEvent';
import getToolsWithModesForTouchEvent from '../shared/getToolsWithModesForTouchEvent';

const { Active, Passive } = ToolModes;

/**
 * touchStart - Event handler for touchStart events. Uses `customCallbackHandler` to fire
 * the `touchStartCallback` function on active tools.
 */
export default function touchStart(evt: EventTypes.TouchStartEventType) {
  if (state.isInteractingWithTool) {
    return;
  }
  const activeTool = getActiveToolForTouchEvent(evt);

  // Check for preTouchStartCallbacks,
  // If the tool claims it consumed the event, prevent further checks.
  if (activeTool && typeof activeTool.preTouchStartCallback === 'function') {
    const consumedEvent = activeTool.preTouchStartCallback(evt);

    if (consumedEvent) {
      return;
    }
  }

  const isPrimaryClick = Object.keys(evt.detail.event.touches).length === 1;
  const activeToolsWithEventBinding = getToolsWithModesForTouchEvent(
    evt,
    [Active],
    Object.keys(evt.detail.event.touches).length
  );
  const passiveToolsIfEventWasPrimaryTouchButton = isPrimaryClick
    ? getToolsWithModesForTouchEvent(evt, [Passive])
    : undefined;
  const applicableTools = [
    ...(activeToolsWithEventBinding || []),
    ...(passiveToolsIfEventWasPrimaryTouchButton || []),
    activeTool,
  ];

  const eventDetail = evt.detail;
  const { element } = eventDetail;

  // Filter tools with annotations for this element
  const annotationToolsWithAnnotations = filterToolsWithAnnotationsForElement(
    element,
    applicableTools
  );

  const canvasCoords = eventDetail.currentPoints.canvas;

  // For the canvas coordinates, find all tools that might respond to this touch start
  // on their handles. This filter will call getHandleNearImagePoint for each tool
  // instance (each annotation)
  const annotationToolsWithMoveableHandles = filterToolsWithMoveableHandles(
    element,
    annotationToolsWithAnnotations,
    canvasCoords,
    'touch'
  );

  const isMultiSelect = false;

  // If there are annotation tools whose handle is near the touch, select the first one
  // that isn't locked. If there's only one annotation tool, select it.
  if (annotationToolsWithMoveableHandles.length > 0) {
    const { tool, annotation, handle } = getAnnotationForSelection(
      annotationToolsWithMoveableHandles
    ) as ToolsWithMoveableHandles;

    toggleAnnotationSelection(annotation.annotationUID, isMultiSelect);
    tool.handleSelectedCallback(evt, annotation, handle, 'Touch');

    return;
  }

  // If there were no annotation tools whose handle was near the touch, try to check
  // if any of the annotation tools are interactable (e.g. moving an entire length annotation)
  const moveableAnnotationTools = filterMoveableAnnotationTools(
    element,
    annotationToolsWithAnnotations,
    canvasCoords,
    'touch'
  );

  // If there are annotation tools that are interactable, select the first one
  // that isn't locked. If there's only one annotation tool, select it.
  if (moveableAnnotationTools.length > 0) {
    const { tool, annotation } = getAnnotationForSelection(
      moveableAnnotationTools
    );

    toggleAnnotationSelection(annotation.annotationUID, isMultiSelect);
    tool.toolSelectedCallback(evt, annotation, 'Touch');

    return;
  }

  // Run the postTouchStartCallback for the active tool if it exists
  if (activeTool && typeof activeTool.postTouchStartCallback === 'function') {
    const consumedEvent = activeTool.postTouchStartCallback(evt);

    if (consumedEvent) {
      // If the tool claims it consumed the event, prevent further checks.
      return;
    }
  }

  // Don't stop propagation so that touchStartActivate can handle the event
}

/**
 * If there are multiple annotation tools, return the first one that isn't locked neither hidden.
 * If there's only one annotation tool, return it
 * @param annotationTools - An array of tools and annotation.
 * @returns The candidate for selection
 */
function getAnnotationForSelection(
  toolsWithMovableHandles: ToolAnnotationPair[]
): ToolAnnotationPair {
  return (
    (toolsWithMovableHandles.length > 1 &&
      toolsWithMovableHandles.find(
        (item) =>
          !isAnnotationLocked(item.annotation) &&
          isAnnotationVisible(item.annotation.annotationUID)
      )) ||
    toolsWithMovableHandles[0]
  );
}

/**
 * If the annotation is selected, deselect it. If it's not selected, select it
 * @param annotationUID - The AnnotationUID that we
 * want to toggle the selection of.
 * @param isMultiSelect - If true, the annotation. will be deselected if it is
 * already selected, or deselected if it is selected.
 */
function toggleAnnotationSelection(
  annotationUID: string,
  isMultiSelect = false
): void {
  if (isMultiSelect) {
    if (isAnnotationSelected(annotationUID)) {
      setAnnotationSelected(annotationUID, false);
    } else {
      const preserveSelected = true;
      setAnnotationSelected(annotationUID, true, preserveSelected);
    }
  } else {
    const preserveSelected = false;
    setAnnotationSelected(annotationUID, true, preserveSelected);
  }
}
