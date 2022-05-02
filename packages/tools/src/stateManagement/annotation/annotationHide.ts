import { eventTarget, triggerEvent } from '@cornerstonejs/core';
import { Events } from '../../enums';
import { Annotation } from '../../types';
import { AnnotationHideChangeEventDetail } from '../../types/EventTypes';

/*
 * Constants
 */
const globalHiddenAnnotationsSet: Set<Annotation> = new Set();

/*
 * Interface (Public API)
 */

/**
 * Set the "hidden" state of a given annotation instance.
 *
 * @triggers ANNOTATION_HIDE_CHANGE
 *
 * @param annotation - The annotation instance which will have
 * its hidden state changed. An event will only be triggered if the hidden state
 * of the given annotation instance changed.
 * @param hidden - A boolean value indicating if the instance should
 * be hidden (true) or not (false)
 */
function setAnnotationHidden(annotation: Annotation, hidden = true): void {
  const detail = makeEventDetail();
  if (annotation) {
    if (hidden) {
      hide(annotation, globalHiddenAnnotationsSet, detail);
    } else {
      show(annotation, globalHiddenAnnotationsSet, detail);
    }
  }
  publish(detail, globalHiddenAnnotationsSet);
}

/**
 * Clears all the hidden annotation
 *
 */
function showAllAnnotations(): void {
  const detail = makeEventDetail();
  clearHiddenAnnotationsSet(globalHiddenAnnotationsSet, detail);
  publish(detail, globalHiddenAnnotationsSet);
}

/**
 * Returns an array of all the annotation that is currently hidden.
 * @returns An array of tool specific annotation objects.
 *
 */
function getAnnotationsHidden(): Array<Annotation> {
  return Array.from(globalHiddenAnnotationsSet);
}

/**
 * Given a Annotation object, return true if it is hidden.
 * @param annotation - Annotation
 * @returns A boolean value.
 */
function isAnnotationHidden(annotation: Annotation): boolean {
  return globalHiddenAnnotationsSet.has(annotation);
}

/**
 * Get the number of hidden annotation objects in the global set of hidden annotation
 * objects.
 * @returns The number of hidden annotation objects.
 *
 */
function getAnnotationsHiddenCount(): number {
  return globalHiddenAnnotationsSet.size;
}

/**
 * Properly initialize the isHidden on annotation, and set it as hidden if
 * isHidden is true.
 * @param annotation - The annotation object to be checked.
 */
function checkAndDefineIsHiddenProperty(annotation: Annotation): void {
  if (annotation) {
    const isHidden = !!annotation.isHidden;
    if (shouldDefineIsHiddenProperty(annotation)) {
      Object.defineProperty(annotation, 'isHidden', {
        configurable: false,
        enumerable: true,
        set: setIsHidden,
        get: getIsHidden,
      });
    }
    setAnnotationHidden(annotation, isHidden);
  }
}

/*
 * Private Helpers
 */

function makeEventDetail(): AnnotationHideChangeEventDetail {
  return Object.freeze({
    added: [],
    removed: [],
    hidden: [],
  });
}

function hide(
  annotation: Annotation,
  hiddenAnnotationsSet: Set<Annotation>,
  detail: AnnotationHideChangeEventDetail
): void {
  if (!hiddenAnnotationsSet.has(annotation)) {
    hiddenAnnotationsSet.add(annotation);
    detail.added.push(annotation);
  }
}

function show(
  annotation: Annotation,
  hiddenAnnotationsSet: Set<Annotation>,
  detail: AnnotationHideChangeEventDetail
): void {
  if (hiddenAnnotationsSet.delete(annotation)) {
    detail.removed.push(annotation);
  }
}

function clearHiddenAnnotationsSet(
  hiddenAnnotationsSet: Set<Annotation>,
  detail: AnnotationHideChangeEventDetail
): void {
  hiddenAnnotationsSet.forEach((annotation) => {
    show(annotation, hiddenAnnotationsSet, detail);
  });
}

function publish(
  detail: AnnotationHideChangeEventDetail,
  hiddenAnnotationsSet: Set<Annotation>
) {
  if (detail.added.length > 0 || detail.removed.length > 0) {
    hiddenAnnotationsSet.forEach((item) => void detail.hidden.push(item));
    triggerEvent(eventTarget, Events.ANNOTATION_HIDE_CHANGE, detail);
  }
}

function shouldDefineIsHiddenProperty(annotation: Annotation): boolean {
  const descriptor = Object.getOwnPropertyDescriptor(annotation, 'isHidden');
  if (descriptor) {
    return (
      descriptor.configurable &&
      (descriptor.set !== setIsHidden || descriptor.get !== getIsHidden)
    );
  }
  return Object.isExtensible(annotation);
}

function setIsHidden(hidden: boolean) {
  setAnnotationHidden(this as Annotation, hidden);
}

function getIsHidden() {
  return isAnnotationHidden(this as Annotation);
}

/*
 * Exports
 */

export {
  setAnnotationHidden,
  getAnnotationsHidden,
  getAnnotationsHiddenCount,
  showAllAnnotations,
  isAnnotationHidden,
  checkAndDefineIsHiddenProperty,
};
