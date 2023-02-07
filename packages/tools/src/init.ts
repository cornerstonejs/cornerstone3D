import { eventTarget, Enums } from '@cornerstonejs/core';
import { getDefaultAnnotationManager } from './stateManagement/annotation/annotationState';
import { getDefaultSegmentationStateManager } from './stateManagement/segmentation/segmentationState';
import { Events as TOOLS_EVENTS } from './enums';
import { addEnabledElement, removeEnabledElement } from './store';
import { resetCornerstoneToolsState } from './store/state';
import {
  annotationSelectionListener,
  segmentationDataModifiedEventListener,
  segmentationRepresentationModifiedEventListener,
  segmentationRepresentationRemovedEventListener,
  segmentationModifiedListener,
  annotationModifiedListener,
} from './eventListeners';

import * as ToolGroupManager from './store/ToolGroupManager';
import {
  addIgnoreDoubleClickCaptureListener,
  removeIgnoreDoubleClickCaptureListener,
} from './eventListeners/mouse/mouseDownListener';

let csToolsInitialized = false;

/**
 * Initialize the cornerstoneTools package. It will add event listeners for mouse
 * and keyboard events.
 * @param defaultConfiguration - A configuration object that will be used to
 * initialize the tool.
 */
export function init(defaultConfiguration = {}): void {
  if (csToolsInitialized) {
    return;
  }

  _addCornerstoneEventListeners();
  _addCornerstoneToolsEventListeners();

  // A separate double click listener at the document root. Separate
  // from the {@link mouseDoubleClickListener} because...
  // - it listens on the capture phase (and not the typical bubble phase)
  // - the data used to ignore the double click is private to the mouseDownListener module
  addIgnoreDoubleClickCaptureListener();

  csToolsInitialized = true;
}

/**
 * It destroys and cleanup state for cornerstone3DTools. It removes all the tools
 * that were added to the tool groups and restore states. It also removes all
 * event listeners.
 */
export function destroy(): void {
  _removeCornerstoneEventListeners();
  _removeCornerstoneToolsEventListeners();

  removeIgnoreDoubleClickCaptureListener();

  // Important: destroy ToolGroups first, in order for cleanup to work correctly for the
  // added tools.
  ToolGroupManager.destroy();

  // Remove all tools
  resetCornerstoneToolsState();

  // remove all annotation.
  const annotationManager = getDefaultAnnotationManager();
  const segmentationStateManager = getDefaultSegmentationStateManager();

  annotationManager.restoreAnnotations({});
  segmentationStateManager.resetState();
  csToolsInitialized = false;
}

/**
 * Wires up event listeners for the Cornerstone#ElementDisabled and
 * Cornerstone#ElementEnabled events.
 *
 * @internal
 */
function _addCornerstoneEventListeners(): void {
  // Clear any listeners that may already be set
  _removeCornerstoneEventListeners();

  const elementEnabledEvent = Enums.Events.ELEMENT_ENABLED;
  const elementDisabledEvent = Enums.Events.ELEMENT_DISABLED;

  eventTarget.addEventListener(elementEnabledEvent, addEnabledElement);
  eventTarget.addEventListener(elementDisabledEvent, removeEnabledElement);
}

/**
 * Removes event listeners for the Cornerstone#ElementDisabled and
 * Cornerstone#ElementEnabled events.
 *
 */
function _removeCornerstoneEventListeners(): void {
  const elementEnabledEvent = Enums.Events.ELEMENT_ENABLED;
  const elementDisabledEvent = Enums.Events.ELEMENT_DISABLED;

  eventTarget.removeEventListener(elementEnabledEvent, addEnabledElement);
  eventTarget.removeEventListener(elementDisabledEvent, removeEnabledElement);
}

/**
 * It adds an event listener to the event target (the cornerstoneTools object) for
 * the annotation selected and annotation modified events.
 */
function _addCornerstoneToolsEventListeners() {
  // Clear any listeners that may already be set
  _removeCornerstoneToolsEventListeners();

  /**
   * Annotation
   */
  eventTarget.addEventListener(
    TOOLS_EVENTS.ANNOTATION_MODIFIED,
    annotationModifiedListener
  );

  eventTarget.addEventListener(
    TOOLS_EVENTS.ANNOTATION_SELECTION_CHANGE,
    annotationSelectionListener
  );

  eventTarget.addEventListener(
    TOOLS_EVENTS.ANNOTATION_SELECTION_CHANGE,
    annotationSelectionListener
  );

  /**
   * Segmentation
   */
  eventTarget.addEventListener(
    TOOLS_EVENTS.SEGMENTATION_MODIFIED,
    segmentationModifiedListener
  );

  eventTarget.addEventListener(
    TOOLS_EVENTS.SEGMENTATION_DATA_MODIFIED,
    segmentationDataModifiedEventListener
  );
  eventTarget.addEventListener(
    TOOLS_EVENTS.SEGMENTATION_REPRESENTATION_MODIFIED,
    segmentationRepresentationModifiedEventListener
  );

  eventTarget.addEventListener(
    TOOLS_EVENTS.SEGMENTATION_REPRESENTATION_REMOVED,
    segmentationRepresentationRemovedEventListener
  );
}

/**
 * Remove the event listener for the the annotation selected and annotation modified events.
 */
function _removeCornerstoneToolsEventListeners() {
  /**
   * Annotation
   */
  eventTarget.removeEventListener(
    TOOLS_EVENTS.ANNOTATION_MODIFIED,
    annotationModifiedListener
  );

  eventTarget.removeEventListener(
    TOOLS_EVENTS.ANNOTATION_SELECTION_CHANGE,
    annotationSelectionListener
  );

  eventTarget.removeEventListener(
    TOOLS_EVENTS.ANNOTATION_SELECTION_CHANGE,
    annotationSelectionListener
  );

  /**
   * Segmentation
   */

  eventTarget.removeEventListener(
    TOOLS_EVENTS.SEGMENTATION_MODIFIED,
    segmentationModifiedListener
  );

  eventTarget.removeEventListener(
    TOOLS_EVENTS.SEGMENTATION_DATA_MODIFIED,
    segmentationDataModifiedEventListener
  );
  eventTarget.removeEventListener(
    TOOLS_EVENTS.SEGMENTATION_REPRESENTATION_MODIFIED,
    segmentationRepresentationModifiedEventListener
  );

  eventTarget.removeEventListener(
    TOOLS_EVENTS.SEGMENTATION_REPRESENTATION_REMOVED,
    segmentationRepresentationRemovedEventListener
  );
}

export default init;
