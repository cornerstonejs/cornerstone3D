import { eventTarget, triggerEvent } from '@cornerstonejs/core';
import { Events } from '../../enums';
import { Annotation } from '../../types';
import { AnnotationSelectionChangeEventDetail } from '../../types/EventTypes';

/*
 * Constants
 */

const selectedAnnotations: Set<Annotation> = new Set();

/*
 * Interface (Public API)
 */

/**
 * Set a given annotation as selected or deselected based on the provided
 * selected value.
 *
 * @param annotation - The annotation to be selected
 * @param selected - When true, the annotation is selected. When false, the annotation is deselected.
 * @param preserveSelected - When true, preserves existing
 *  selections (i.e., the given annotation is appended to the selection set).
 *  When false (the default behavior) the currently selected items are discarded
 *  (i.e., the given annotation instance replaces the currently selected ones).
 */
function setAnnotationSelected(
  annotation: Annotation,
  selected = true,
  preserveSelected = false
): void {
  if (selected) {
    selectAnnotation(annotation, preserveSelected);
  } else {
    deselectAnnotation(annotation);
  }
}

/**
 * Set a given annotation as selected.
 *
 * @param annotation - The annotation to be selected
 * @param preserveSelected - When true, preserves existing
 *  selections (i.e., the given annotation is appended to the selection set).
 *  When false (the default behavior) the currently selected items are discarded
 *  (i.e., the given annotation instance replaces the currently selected ones).
 */
function selectAnnotation(
  annotation: Annotation,
  preserveSelected = false
): void {
  const detail = makeEventDetail();
  if (!preserveSelected) {
    clearSelectionSet(selectedAnnotations, detail);
  }
  if (annotation && !selectedAnnotations.has(annotation)) {
    selectedAnnotations.add(annotation);
    detail.added.push(annotation);
  }
  publish(detail, selectedAnnotations);
}

/**
 * Deselect one or all annotation instances.
 *
 * @param annotation - If an annotation is provided that instance will be removed from
 * the internal selection set. If none is given, ALL selections will be cleared.
 */
function deselectAnnotation(annotation?: Annotation): void {
  const detail = makeEventDetail();
  if (annotation) {
    if (selectedAnnotations.delete(annotation)) {
      detail.removed.push(annotation);
    }
  } else {
    clearSelectionSet(selectedAnnotations, detail);
  }
  publish(detail, selectedAnnotations);
}

/**
 * Return an array of ALL the selected annotation
 * @returns An array of Annotation objects.
 */
function getAnnotationsSelected(): Array<Annotation> {
  return Array.from(selectedAnnotations);
}

/**
 * Given a annotationUID, return the Annotation object that has that
 * annotationUID
 * @param annotationUID - The UID of the annotation to be retrieved.
 * @returns A Annotation object.
 */
function getAnnotationSelected(annotationUID: string): Annotation {
  return getAnnotationsSelected().find((annotation) => {
    return annotation.annotationUID === annotationUID;
  });
}

/**
 * Given a tool name, return ALL the annotation for that tool that are selected
 * @param toolName - The name of the tool you want to get the selected annotation for
 * @returns An array of tool specific annotation that are selected
 */
function getAnnotationsSelectedByToolName(toolName: string): Array<Annotation> {
  return getAnnotationsSelected().filter((annotation) => {
    return annotation.metadata.toolName === toolName;
  });
}

/**
 * Given an annotation object, return true if it is selected, false
 * otherwise.
 * @param annotation - Annotation
 * @returns A boolean value.
 */
function isAnnotationSelected(annotation: Annotation): boolean {
  return selectedAnnotations.has(annotation);
}

/**
 * Return the number of the selected annotation
 * @returns The size of the selected annotation set
 */
function getAnnotationsSelectedCount(): number {
  return selectedAnnotations.size;
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
  selectionSet: Set<Annotation>,
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
  selectionSet: Set<Annotation>
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
  getAnnotationSelected,
  getAnnotationsSelectedByToolName,
  getAnnotationsSelectedCount,
  deselectAnnotation,
  isAnnotationSelected,
};
