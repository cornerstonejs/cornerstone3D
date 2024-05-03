import { eventTarget, triggerEvent } from '@cornerstonejs/core';
import { Events } from '../../enums';
import { AnnotationSelectionChangeEventDetail } from '../../types/EventTypes';
import { getAnnotation } from './annotationState';

/*
 * Constants
 */

const selectedAnnotationUIDs: Set<string> = new Set();

/*
 * Interface (Public API)
 */

/**
 * Set a given annotationUID as selected or deselected based on the provided
 * selected value.
 *
 * @param annotationUID - The annotation UID to be selected
 * @param selected - When true, the annotation is selected. When false, the annotation is deselected.
 * @param preserveSelected - When true, preserves existing
 *  selections (i.e., the given annotation is appended to the selection set).
 *  When false (the default behavior) the currently selected items are discarded
 *  (i.e., the given annotation instance replaces the currently selected ones).
 */
function setAnnotationSelected(
  annotationUID: string,
  selected = true,
  preserveSelected = false
): void {
  if (selected) {
    selectAnnotation(annotationUID, preserveSelected);
  } else {
    deselectAnnotation(annotationUID);
  }
}

/**
 * Set a given annotation as selected.
 *
 * @param annotationUID - The annotation UID to be selected
 * @param preserveSelected - When true, preserves existing
 *  selections (i.e., the given annotation is appended to the selection set).
 *  When false (the default behavior) the currently selected items are discarded
 *  (i.e., the given annotation instance replaces the currently selected ones).
 */
function selectAnnotation(
  annotationUID: string,
  preserveSelected = false
): void {
  const detail = makeEventDetail();
  if (!preserveSelected) {
    clearSelectionSet(selectedAnnotationUIDs, detail);
  }
  if (annotationUID && !selectedAnnotationUIDs.has(annotationUID)) {
    selectedAnnotationUIDs.add(annotationUID);
    detail.added.push(annotationUID);
  }
  publish(detail, selectedAnnotationUIDs);
}

/**
 * Deselect one or all annotations.
 *
 * @param annotationUID - If an annotation is provided that instance will be removed from
 * the internal selection set. If none is given, ALL selections will be cleared.
 */
function deselectAnnotation(annotationUID?: string): void {
  const detail = makeEventDetail();
  if (annotationUID) {
    if (selectedAnnotationUIDs.delete(annotationUID)) {
      detail.removed.push(annotationUID);
    }
  } else {
    clearSelectionSet(selectedAnnotationUIDs, detail);
  }
  publish(detail, selectedAnnotationUIDs);
}

/**
 * Return an array of ALL the selected annotationUIDs
 * @returns An array of Annotation UIDs
 */
function getAnnotationsSelected(): Array<string> {
  return Array.from(selectedAnnotationUIDs);
}

/**
 * Given a tool name, return ALL the annotationUIDs for that tool that are selected
 * @param toolName - The name of the tool you want to get the selected annotation for
 * @returns An array of annotationUIDs
 */
function getAnnotationsSelectedByToolName(toolName: string): Array<string> {
  return getAnnotationsSelected().filter((annotationUID) => {
    const annotation = getAnnotation(annotationUID);
    return annotation?.metadata?.toolName === toolName;
  });
}

/**
 * Given an annotationUID, return true if it is selected, false
 * otherwise.
 * @param annotationUID - Annotation UID
 * @returns A boolean value.
 */
function isAnnotationSelected(annotationUID: string): boolean {
  return selectedAnnotationUIDs.has(annotationUID);
}

/**
 * Return the number of the selected annotation
 * @returns The size of the selected annotation set
 */
function getAnnotationsSelectedCount(): number {
  return selectedAnnotationUIDs.size;
}

/*
 * Private Helpers
 */

function makeEventDetail(): AnnotationSelectionChangeEventDetail {
  return Object.freeze({
    added: [],
    removed: [],
    selection: [],
  });
}

function clearSelectionSet(
  selectionSet: Set<string>,
  detail: AnnotationSelectionChangeEventDetail
): void {
  selectionSet.forEach((value) => {
    if (selectionSet.delete(value)) {
      detail.removed.push(value);
    }
  });
}

function publish(
  detail: AnnotationSelectionChangeEventDetail,
  selectionSet: Set<string>
) {
  if (detail.added.length > 0 || detail.removed.length > 0) {
    selectionSet.forEach((item) => void detail.selection.push(item));
    triggerEvent(eventTarget, Events.ANNOTATION_SELECTION_CHANGE, detail);
  }
}

/*
 * Exports
 */

export {
  setAnnotationSelected,
  getAnnotationsSelected,
  getAnnotationsSelectedByToolName,
  getAnnotationsSelectedCount,
  deselectAnnotation,
  isAnnotationSelected,
};
