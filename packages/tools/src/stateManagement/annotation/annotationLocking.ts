import { eventTarget, triggerEvent } from '@cornerstonejs/core';
import { Events } from '../../enums';
import { Annotation } from '../../types';
import { AnnotationLockChangeEventDetail } from '../../types/EventTypes';

/*
 * Constants
 */
const globalLockedAnnotationsSet: Set<Annotation> = new Set();

/*
 * Interface (Public API)
 */

/**
 * Set the "Locked" state of a given annotation instance.
 *
 * @triggers ANNOTATION_LOCK_CHANGE
 *
 * @param annotation - The annotation instance which will have
 * its locked state changed. An event will only be triggered if the locked state
 * of the given annotation instance changed.
 * @param locked - A boolean value indicating if the instance should
 * be locked (true) or not (false)
 */
function setAnnotationLocked(annotation: Annotation, locked = true): void {
  const detail = makeEventDetail();
  if (annotation) {
    if (locked) {
      lock(annotation, globalLockedAnnotationsSet, detail);
    } else {
      unlock(annotation, globalLockedAnnotationsSet, detail);
    }
  }
  publish(detail, globalLockedAnnotationsSet);
}

/**
 * Clears all the locked annotation
 *
 */
function unlockAllAnnotations(): void {
  const detail = makeEventDetail();
  clearLockedAnnotationsSet(globalLockedAnnotationsSet, detail);
  publish(detail, globalLockedAnnotationsSet);
}

/**
 * Returns an array of all the annotation that is currently locked
 * @returns An array of tool specific annotation objects.
 *
 */
function getAnnotationsLocked(): Array<Annotation> {
  return Array.from(globalLockedAnnotationsSet);
}

/**
 * Given a Annotation object, return true if it is locked.
 * @param annotation - Annotation
 * @returns A boolean value.
 */
function isAnnotationLocked(annotation: Annotation): boolean {
  return globalLockedAnnotationsSet.has(annotation);
}

/**
 * Get the number of locked annotation objects in the global set of locked annotation
 * objects.
 * @returns The number of locked annotation objects.
 *
 */
function getAnnotationsLockedCount(): number {
  return globalLockedAnnotationsSet.size;
}

/**
 * Properly initialize the isLocked on annotation, and set it as locked if
 * isLocked is true.
 * @param annotation - The annotation object to be checked.
 */
function checkAndDefineIsLockedProperty(annotation: Annotation): void {
  if (annotation) {
    const isLocked = !!annotation.isLocked;
    if (shouldDefineIsLockedProperty(annotation)) {
      Object.defineProperty(annotation, 'isLocked', {
        configurable: false,
        enumerable: true,
        set: setIsLocked,
        get: getIsLocked,
      });
    }
    setAnnotationLocked(annotation, isLocked);
  }
}

/*
 * Private Helpers
 */

function makeEventDetail(): AnnotationLockChangeEventDetail {
  return Object.freeze({
    added: [],
    removed: [],
    locked: [],
  });
}

function lock(
  annotation: Annotation,
  lockedAnnotationsSet: Set<Annotation>,
  detail: AnnotationLockChangeEventDetail
): void {
  if (!lockedAnnotationsSet.has(annotation)) {
    lockedAnnotationsSet.add(annotation);
    detail.added.push(annotation);
  }
}

function unlock(
  annotation: Annotation,
  lockedAnnotationsSet: Set<Annotation>,
  detail: AnnotationLockChangeEventDetail
): void {
  if (lockedAnnotationsSet.delete(annotation)) {
    detail.removed.push(annotation);
  }
}

function clearLockedAnnotationsSet(
  lockedAnnotationsSet: Set<Annotation>,
  detail: AnnotationLockChangeEventDetail
): void {
  lockedAnnotationsSet.forEach((annotation) => {
    unlock(annotation, lockedAnnotationsSet, detail);
  });
}

function publish(
  detail: AnnotationLockChangeEventDetail,
  lockedAnnotationsSet: Set<Annotation>
) {
  if (detail.added.length > 0 || detail.removed.length > 0) {
    lockedAnnotationsSet.forEach((item) => void detail.locked.push(item));
    triggerEvent(eventTarget, Events.ANNOTATION_LOCK_CHANGE, detail);
  }
}

function shouldDefineIsLockedProperty(annotation: Annotation): boolean {
  const descriptor = Object.getOwnPropertyDescriptor(annotation, 'isLocked');
  if (descriptor) {
    return (
      descriptor.configurable &&
      (descriptor.set !== setIsLocked || descriptor.get !== getIsLocked)
    );
  }
  return Object.isExtensible(annotation);
}

function setIsLocked(locked: boolean) {
  setAnnotationLocked(this as Annotation, locked);
}

function getIsLocked() {
  return isAnnotationLocked(this as Annotation);
}

/*
 * Exports
 */

export {
  setAnnotationLocked,
  getAnnotationsLocked,
  getAnnotationsLockedCount,
  unlockAllAnnotations,
  isAnnotationLocked,
  checkAndDefineIsLockedProperty,
};
