import { eventTarget, triggerEvent } from '@cornerstonejs/core';
import { Events } from '../../enums';
import { Annotation } from '../../types';
import { AnnotationVisibilityChangeEventDetail } from '../../types/EventTypes';

/*
 * Constants
 */
const globalHiddenAnnotationUIDsSet: Set<string> = new Set();
const globalVisibleAnnotationUIDsSet: Set<string> = new Set();

/*
 * Interface (Public API)
 */

/**
 * Set the "visible" state of a given annotation instance.
 *
 * @triggers ANNOTATION_VISIBILITY_CHANGE
 *
 * @param annotationUID - The annotation uid which will have
 * its visible state changed. An event will only be triggered if the visible state
 * of the given annotation instance changed.
 * @param visible - A boolean value indicating if the instance should
 * be visible (true) or not (false)
 */
function setAnnotationVisibility(annotationUID: string, visible = true): void {
  const detail = makeEventDetail();
  if (annotationUID) {
    if (visible) {
      show(annotationUID, detail);
    } else {
      hide(annotationUID, detail);
    }
  }
  publish(detail);
}

/**
 * Clears all the hidden annotations.
 *
 */
function showAllAnnotations(): void {
  const detail = makeEventDetail();
  runAnnotationUIDsSetOperation(detail, globalHiddenAnnotationUIDsSet, show);
  publish(detail);
}

/**
 * Hide all annotations.
 *
 */
function hideAllAnnotations(): void {
  const detail = makeEventDetail();
  runAnnotationUIDsSetOperation(detail, globalVisibleAnnotationUIDsSet, hide);
  publish(detail);
}

/**
 * Returns an array of all the annotation that is currently hidden.
 * @returns An array of tool specific annotation UIDs.
 *
 */
function getAnnotationUIDsHidden(): Array<string> {
  return Array.from(globalHiddenAnnotationUIDsSet);
}

/**
 * Returns an array of all the annotation that is currently visible.
 * @returns An array of tool specific annotation UIDs.
 *
 */
function getAnnotationUIDsVisible(): Array<string> {
  return Array.from(globalVisibleAnnotationUIDsSet);
}

/**
 * Given an annotation UID, return true if it is visible.
 * @param annotationUID - The annotation uid to tell if is visible or not.
 * @returns A boolean value.
 */
function isAnnotationVisible(annotationUID: string): boolean {
  return globalVisibleAnnotationUIDsSet.has(annotationUID);
}

/**
 * Get the number of hidden annotation objects in the global set of hidden annotation
 * objects.
 * @returns The number of hidden annotation objects.
 *
 */
function getAnnotationUIDsHiddenCount(): number {
  return globalHiddenAnnotationUIDsSet.size;
}

/**
 * Get the number of visible annotation objects in the global set of visible annotation
 * objects.
 * @returns The number of visible annotation objects.
 *
 */
function getAnnotationUIDsVisibleCount(): number {
  return globalVisibleAnnotationUIDsSet.size;
}

/**
 * Properly initialize the isVisible on annotation.
 * It set up isVisible property (the property will be create if does not exist yet)
 * @param annotation - The annotation object to be checked.
 */
function checkAndDefineIsVisibleProperty(annotation: Annotation): void {
  if (annotation) {
    const isVisible = annotation.isVisible ?? true;
    if (shouldDefineIsVisibleProperty(annotation)) {
      Object.defineProperty(annotation, 'isVisible', {
        configurable: false,
        enumerable: true,
        set: setIsVisible,
        get: getIsVisible,
      });
    }
    setAnnotationVisibility(annotation.annotationUID, isVisible);
  }
}

/*
 * Private Helpers
 */

function makeEventDetail(): AnnotationVisibilityChangeEventDetail {
  return Object.freeze({
    added: [],
    removed: [],
    hidden: [],
    visible: [],
  });
}

function updateAnnotationUIDsSet(
  annotationUID: string,
  targetAnnotationUIDsSet: Set<string>,
  otherAnnotationUIDsSet: Set<string>
) {
  if (targetAnnotationUIDsSet.has(annotationUID)) {
    return false;
  }
  targetAnnotationUIDsSet.add(annotationUID);
  otherAnnotationUIDsSet.delete(annotationUID);

  return true;
}

function show(
  annotationUID: string,
  detail: AnnotationVisibilityChangeEventDetail
): void {
  if (
    updateAnnotationUIDsSet(
      annotationUID,
      globalVisibleAnnotationUIDsSet,
      globalHiddenAnnotationUIDsSet
    )
  ) {
    detail.added.push(annotationUID);
  }
}

function hide(
  annotationUID: string,
  detail: AnnotationVisibilityChangeEventDetail
): void {
  if (
    updateAnnotationUIDsSet(
      annotationUID,
      globalHiddenAnnotationUIDsSet,
      globalVisibleAnnotationUIDsSet
    )
  ) {
    detail.removed.push(annotationUID);
  }
}

function runAnnotationUIDsSetOperation(
  detail: AnnotationVisibilityChangeEventDetail,
  annotationUIDsSet: Set<string>,
  operation: (string, AnnotationVisibilityChangeEventDetail) => void
): void {
  annotationUIDsSet.forEach((annotationUID) => {
    operation(annotationUID, detail);
  });
}

function publish(detail: AnnotationVisibilityChangeEventDetail) {
  if (detail.added.length > 0 || detail.removed.length > 0) {
    globalHiddenAnnotationUIDsSet.forEach(
      (item) => void detail.hidden.push(item)
    );
    globalVisibleAnnotationUIDsSet.forEach(
      (item) => void detail.visible.push(item)
    );
    triggerEvent(eventTarget, Events.ANNOTATION_VISIBILITY_CHANGE, detail);
  }
}

function shouldDefineIsVisibleProperty(annotation: Annotation): boolean {
  const descriptor = Object.getOwnPropertyDescriptor(annotation, 'isVisible');
  if (descriptor) {
    return (
      descriptor.configurable &&
      (descriptor.set !== setIsVisible || descriptor.get !== getIsVisible)
    );
  }
  return Object.isExtensible(annotation);
}

function setIsVisible(hidden: boolean) {
  setAnnotationVisibility((this as Annotation).annotationUID, hidden);
}

function getIsVisible() {
  return isAnnotationVisible((this as Annotation).annotationUID);
}

/*
 * Exports
 */

export {
  setAnnotationVisibility,
  getAnnotationUIDsHidden,
  getAnnotationUIDsVisible,
  getAnnotationUIDsHiddenCount,
  getAnnotationUIDsVisibleCount,
  showAllAnnotations,
  hideAllAnnotations,
  isAnnotationVisible,
  checkAndDefineIsVisibleProperty,
};
