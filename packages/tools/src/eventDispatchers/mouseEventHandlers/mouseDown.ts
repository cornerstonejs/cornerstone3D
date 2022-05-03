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
import getActiveToolForMouseEvent from '../shared/getActiveToolForMouseEvent';
import getToolsWithModesForMouseEvent from '../shared/getToolsWithModesForMouseEvent';

const { Active, Passive } = ToolModes;

/**
 * When the mouse is depressed we check which entities can process these events in the following manner:
 *
 * - First we get the `activeTool` for the mouse button pressed.
 * - If the `activeTool` has a `preMouseDownCallback`, this is called. If the callback returns `true`,
 *   the event does not propagate further.
 * - Next we get all tools which are active or passive (`activeAndPassiveTools`), as annotation. for these tools could
 *   possibly catch and handle these events. We then filter the `activeAndPassiveTools` using `filterToolsWithAnnotationsForElement`, which filters tools with annotations
 *   for this frame of reference. Optionally a tool can employ a further filtering (via a
 *   `filterInteractableAnnotationsForElement` callback) for tools interactable within the current camera view
 *   (e.g. tools that only render when viewed from a certain direction).
 * - Next we check if any handles are interactable for each tool (`filterToolsWithMoveableHandles`). If interactable
 *   handles are found, the first tool/handle found consumes the event and the event does not propagate further.
 * - Next we check any tools are interactable (e.g. moving an entire length annotation rather than one of its handles:
 *   `filterMoveableAnnotationTools`). If interactable tools are found, the first tool found consumes the event and the
 *   event does not propagate further.
 * - Finally, if the `activeTool` has `postMouseDownCallback`, this is called.  If the callback returns `true`,
 *   the event does not propagate further.
 *
 * If the event is not consumed the event will bubble to the `mouseDownActivate` handler.
 *
 * @param evt - The normalized mouseDown event.
 */
export default function mouseDown(evt: EventTypes.MouseDownEventType) {
  // If a tool has locked the current state it is dealing with an interaction within its own eventLoop.
  if (state.isInteractingWithTool) {
    return;
  }

  const activeTool = getActiveToolForMouseEvent(evt);

  // Check for preMouseDownCallbacks,
  // If the tool claims it consumed the event, prevent further checks.
  if (activeTool && typeof activeTool.preMouseDownCallback === 'function') {
    const consumedEvent = activeTool.preMouseDownCallback(evt);

    if (consumedEvent) {
      return;
    }
  }

  // Find all tools that might respond to this mouse down
  const isPrimaryClick = evt.detail.event.buttons === 1;
  const activeToolsWithEventBinding = getToolsWithModesForMouseEvent(
    evt,
    [Active],
    evt.detail.event.buttons
  );
  const passiveToolsIfEventWasPrimaryMouseButton = isPrimaryClick
    ? getToolsWithModesForMouseEvent(evt, [Passive])
    : undefined;
  const applicableTools = [
    ...(activeToolsWithEventBinding || []),
    ...(passiveToolsIfEventWasPrimaryMouseButton || []),
  ];

  const eventDetail = evt.detail;
  const { element } = eventDetail;

  // Filter tools with annotations for this element
  const annotationToolsWithAnnotations = filterToolsWithAnnotationsForElement(
    element,
    applicableTools
  );

  const canvasCoords = eventDetail.currentPoints.canvas;

  // For the canvas coordinates, find all tools that might respond to this mouse down
  // on their handles. This filter will call getHandleNearImagePoint for each tool
  // instance (each annotation)
  const annotationToolsWithMoveableHandles = filterToolsWithMoveableHandles(
    element,
    annotationToolsWithAnnotations,
    canvasCoords,
    'mouse'
  );

  // Preserve existing selections when shift key is pressed
  const isMultiSelect = !!evt.detail.event.shiftKey;

  // If there are annotation tools whose handle is near the mouse, select the first one
  // that isn't locked. If there's only one annotation tool, select it.
  if (annotationToolsWithMoveableHandles.length > 0) {
    const { tool, annotation, handle } = getAnnotationForSelection(
      annotationToolsWithMoveableHandles
    ) as ToolsWithMoveableHandles;

    toggleAnnotationSelection(annotation.annotationUID, isMultiSelect);
    tool.handleSelectedCallback(evt, annotation, handle, 'Mouse');

    return;
  }

  // If there were no annotation tools whose handle was near the mouse, try to check
  // if any of the annotation tools are interactable (e.g. moving an entire length annotation)
  const moveableAnnotationTools = filterMoveableAnnotationTools(
    element,
    annotationToolsWithAnnotations,
    canvasCoords,
    'mouse'
  );

  // If there are annotation tools that are interactable, select the first one
  // that isn't locked. If there's only one annotation tool, select it.
  if (moveableAnnotationTools.length > 0) {
    const { tool, annotation } = getAnnotationForSelection(
      moveableAnnotationTools
    );

    toggleAnnotationSelection(annotation.annotationUID, isMultiSelect);
    tool.toolSelectedCallback(evt, annotation, 'Mouse');

    return;
  }

  // Run the postMouseDownCallback for the active tool if it exists
  if (activeTool && typeof activeTool.postMouseDownCallback === 'function') {
    const consumedEvent = activeTool.postMouseDownCallback(evt);

    if (consumedEvent) {
      // If the tool claims it consumed the event, prevent further checks.
      return;
    }
  }

  // Don't stop propagation so that mouseDownActivate can handle the event
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
