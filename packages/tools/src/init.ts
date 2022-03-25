import { eventTarget, Enums } from '@cornerstonejs/core'
import { getDefaultAnnotationManager } from './stateManagement/annotation/annotationState'
import { getDefaultSegmentationStateManager } from './stateManagement/segmentation/segmentationState'
import { Events as TOOLS_EVENTS } from './enums'
import { addEnabledElement, removeEnabledElement } from './store'
import { resetCornerstoneToolsState } from './store/state'
import {
  annotationSelectionListener,
  segmentationDataModifiedEventListener,
  segmentationStateModifiedEventListener,
  annotationModifiedListener,
} from './eventListeners'

import * as ToolGroupManager from './store/ToolGroupManager'

let csToolsInitialized = false

/**
 * Initialize the cornerstoneTools package. It will add event listeners for mouse
 * and keyboard events.
 * @param defaultConfiguration - A configuration object that will be used to
 * initialize the tool.
 */
export function init(defaultConfiguration = {}): void {
  if (csToolsInitialized) {
    return
  }

  _addCornerstoneEventListeners()
  _addCornerstoneToolsEventListeners()

  csToolsInitialized = true
}

/**
 * It destroys and cleanup state for cornerstone3DTools. It removes all the tools
 * that were added to the tool groups and restore states. It also removes all
 * event listeners.
 */
export function destroy(): void {
  _removeCornerstoneEventListeners()
  _removeCornerstoneToolsEventListeners()

  // Important: destroy ToolGroups first, in order for cleanup to work correctly for the
  // added tools.
  ToolGroupManager.destroy()

  // Remove all tools
  resetCornerstoneToolsState()

  // remove all annotation.
  const annotationManager = getDefaultAnnotationManager()
  const segmentationStateManager = getDefaultSegmentationStateManager()

  annotationManager.restoreAnnotations({})
  segmentationStateManager.resetState()
  csToolsInitialized = false
}

/**
 * Wires up event listeners for the Cornerstone#ElementDisabled and
 * Cornerstone#ElementEnabled events.
 *
 * @internal
 */
function _addCornerstoneEventListeners(): void {
  // Clear any listeners that may already be set
  _removeCornerstoneEventListeners()

  const elementEnabledEvent = Enums.Events.ELEMENT_ENABLED
  const elementDisabledEvent = Enums.Events.ELEMENT_DISABLED

  eventTarget.addEventListener(elementEnabledEvent, addEnabledElement)
  eventTarget.addEventListener(elementDisabledEvent, removeEnabledElement)
}

/**
 * Removes event listeners for the Cornerstone#ElementDisabled and
 * Cornerstone#ElementEnabled events.
 *
 */
function _removeCornerstoneEventListeners(): void {
  const elementEnabledEvent = Enums.Events.ELEMENT_ENABLED
  const elementDisabledEvent = Enums.Events.ELEMENT_DISABLED

  eventTarget.removeEventListener(elementEnabledEvent, addEnabledElement)
  eventTarget.removeEventListener(elementDisabledEvent, removeEnabledElement)
}

/**
 * It adds an event listener to the event target (the cornerstoneTools object) for
 * the annotation selected and annotation modified events.
 */
function _addCornerstoneToolsEventListeners() {
  // Clear any listeners that may already be set
  _removeCornerstoneToolsEventListeners()

  const selectionEvent = TOOLS_EVENTS.ANNOTATION_SELECTION_CHANGE
  const segmentationDataModified = TOOLS_EVENTS.SEGMENTATION_DATA_MODIFIED
  const segmentationStateModified =
    TOOLS_EVENTS.SEGMENTATION_REPRESENTATION_MODIFIED
  const modifiedEvent = TOOLS_EVENTS.ANNOTATION_MODIFIED

  eventTarget.addEventListener(selectionEvent, annotationSelectionListener)
  eventTarget.addEventListener(
    segmentationDataModified,
    segmentationDataModifiedEventListener
  )
  eventTarget.addEventListener(
    segmentationStateModified,
    segmentationStateModifiedEventListener
  )

  eventTarget.addEventListener(selectionEvent, annotationSelectionListener)
  eventTarget.addEventListener(modifiedEvent, annotationModifiedListener)
}

/**
 * Remove the event listener for the the annotation selected and annotation modified events.
 */
function _removeCornerstoneToolsEventListeners() {
  const selectionEvent = TOOLS_EVENTS.ANNOTATION_SELECTION_CHANGE
  const modifiedEvent = TOOLS_EVENTS.ANNOTATION_MODIFIED
  const segmentationDataModified = TOOLS_EVENTS.SEGMENTATION_DATA_MODIFIED
  const segmentationStateModified =
    TOOLS_EVENTS.SEGMENTATION_REPRESENTATION_MODIFIED

  eventTarget.removeEventListener(selectionEvent, annotationSelectionListener)
  eventTarget.removeEventListener(
    segmentationDataModified,
    segmentationDataModifiedEventListener
  )
  eventTarget.removeEventListener(
    segmentationStateModified,
    segmentationStateModifiedEventListener
  )

  eventTarget.removeEventListener(selectionEvent, annotationSelectionListener)
  eventTarget.removeEventListener(modifiedEvent, annotationModifiedListener)
}

export default init
