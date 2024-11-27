import { eventTarget, triggerEvent } from '@cornerstonejs/core';
import { Events } from '../../enums';
import type { AnnotationVisibilityChangeEventDetail } from '../../types/EventTypes';
import {
  isAnnotationSelected,
  deselectAnnotation,
} from './annotationSelection';
import { getAnnotation } from './getAnnotation';

/*
 * It stores all hidden annotation uids.
 */
const globalHiddenAnnotationUIDsSet: Set<string> = new Set();

/*
 * Interface (Public API)
 */

/**
 * Set the "visible" state of a given annotation instance.
 *
 * @event ANNOTATION_VISIBILITY_CHANGE
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
      show(annotationUID, globalHiddenAnnotationUIDsSet, detail);
    } else {
      hide(annotationUID, globalHiddenAnnotationUIDsSet, detail);
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
  globalHiddenAnnotationUIDsSet.forEach((annotationUID) => {
    show(annotationUID, globalHiddenAnnotationUIDsSet, detail);
  });
  publish(detail);
}

/**
 * Given an annotation UID, return true if it is visible, false if hidden and undefined if does not exist.
 * @param annotationUID - The annotation uid to tell if is visible or not.
 * @returns A boolean value or value if does not exist.
 */
function isAnnotationVisible(annotationUID: string): boolean | undefined {
  const annotation = getAnnotation(annotationUID);

  if (annotation) {
    return !globalHiddenAnnotationUIDsSet.has(annotationUID);
  }
}

/*
 * Private Helpers
 */
function makeEventDetail(): AnnotationVisibilityChangeEventDetail {
  return Object.freeze({
    lastVisible: [],
    lastHidden: [],
    hidden: [],
  });
}

function show(
  annotationUID: string,
  annotationUIDsSet: Set<string>,
  detail: AnnotationVisibilityChangeEventDetail
): void {
  if (annotationUIDsSet.delete(annotationUID)) {
    detail.lastVisible.push(annotationUID);
    const annotation = getAnnotation(annotationUID);
    annotation.isVisible = true;
  }
}

function hide(
  annotationUID: string,
  annotationUIDsSet: Set<string>,
  detail: AnnotationVisibilityChangeEventDetail
): void {
  if (!annotationUIDsSet.has(annotationUID)) {
    annotationUIDsSet.add(annotationUID);
    if (isAnnotationSelected(annotationUID)) {
      deselectAnnotation(annotationUID);
    }
    detail.lastHidden.push(annotationUID);
  }
}

function publish(detail: AnnotationVisibilityChangeEventDetail) {
  if (detail.lastHidden.length > 0 || detail.lastVisible.length > 0) {
    globalHiddenAnnotationUIDsSet.forEach(
      (item) => void detail.hidden.push(item)
    );
    triggerEvent(eventTarget, Events.ANNOTATION_VISIBILITY_CHANGE, detail);
  }
}

/**
 * Properly initialize the isVisible state for an annotation based on its UID.
 * @param annotationUID - The UID of the annotation to be checked.
 * @returns The visibility state of the annotation.
 */
function checkAndSetAnnotationVisibility(annotationUID: string): boolean {
  const isVisible = !globalHiddenAnnotationUIDsSet.has(annotationUID);
  setAnnotationVisibility(annotationUID, isVisible);

  return isVisible;
}

export {
  setAnnotationVisibility,
  showAllAnnotations,
  isAnnotationVisible,
  checkAndSetAnnotationVisibility,
};
