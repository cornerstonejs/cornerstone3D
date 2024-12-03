import { eventTarget, triggerEvent } from '@cornerstonejs/core';
import { Events } from '../../enums';
import type { AnnotationLockChangeEventDetail } from '../../types/EventTypes';
import { getAnnotation } from './annotationState';

/*
 * Constants
 */
const globalLockedAnnotationUIDsSet: Set<string> = new Set();

/*
 * Interface (Public API)
 */

/**
 * Set the "Locked" state of a given annotation instance.
 *
 * @triggers ANNOTATION_LOCK_CHANGE
 *
 * @param annotationUID - The UID of the annotation which will have
 * its locked state changed. An event will only be triggered if the locked state
 * of the given annotation instance changed.
 * @param locked - A boolean value indicating if the instance should
 * be locked (true) or not (false)
 */
function setAnnotationLocked(annotationUID: string, locked = true): void {
  const detail = makeEventDetail();
  if (annotationUID) {
    if (locked) {
      lock(annotationUID, globalLockedAnnotationUIDsSet, detail);
    } else {
      unlock(annotationUID, globalLockedAnnotationUIDsSet, detail);
    }
  }
  publish(detail, globalLockedAnnotationUIDsSet);
}

/**
 * Clears all the locked annotations
 */
function unlockAllAnnotations(): void {
  const detail = makeEventDetail();
  clearLockedAnnotationsSet(globalLockedAnnotationUIDsSet, detail);
  publish(detail, globalLockedAnnotationUIDsSet);
}

/**
 * Returns an array of all the annotation UIDs that are currently locked
 * @returns An array of annotation UIDs.
 */
function getAnnotationsLocked(): Array<string> {
  return Array.from(globalLockedAnnotationUIDsSet);
}

/**
 * Given an annotation UID, return true if it is locked.
 * @param annotationUID - Annotation UID
 * @returns A boolean value.
 */
function isAnnotationLocked(annotationUID: string): boolean {
  return globalLockedAnnotationUIDsSet.has(annotationUID);
}

/**
 * Get the number of locked annotation UIDs in the global set of locked annotation UIDs.
 * @returns The number of locked annotation UIDs.
 */
function getAnnotationsLockedCount(): number {
  return globalLockedAnnotationUIDsSet.size;
}

/**
 * Properly initialize the isLocked state for an annotation based on its UID.
 * @param annotationUID - The UID of the annotation to be checked.
 */
function checkAndSetAnnotationLocked(annotationUID: string): boolean {
  const isLocked = isAnnotationLocked(annotationUID);
  setAnnotationLocked(annotationUID, isLocked);

  return isLocked;
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
  annotationUID: string,
  lockedAnnotationUIDsSet: Set<string>,
  detail: AnnotationLockChangeEventDetail
): void {
  if (!lockedAnnotationUIDsSet.has(annotationUID)) {
    lockedAnnotationUIDsSet.add(annotationUID);
    detail.added.push(annotationUID);
    const annotation = getAnnotation(annotationUID);

    if (annotation) {
      annotation.isLocked = true;
    }
  }
}

function unlock(
  annotationUID: string,
  lockedAnnotationUIDsSet: Set<string>,
  detail: AnnotationLockChangeEventDetail
): void {
  if (lockedAnnotationUIDsSet.delete(annotationUID)) {
    detail.removed.push(annotationUID);

    const annotation = getAnnotation(annotationUID);

    if (annotation) {
      annotation.isLocked = false;
    }
  }
}

function clearLockedAnnotationsSet(
  lockedAnnotationUIDsSet: Set<string>,
  detail: AnnotationLockChangeEventDetail
): void {
  lockedAnnotationUIDsSet.forEach((annotationUID) => {
    unlock(annotationUID, lockedAnnotationUIDsSet, detail);
  });
}

function publish(
  detail: AnnotationLockChangeEventDetail,
  lockedAnnotationUIDsSet: Set<string>
) {
  if (detail.added.length > 0 || detail.removed.length > 0) {
    lockedAnnotationUIDsSet.forEach((item) => void detail.locked.push(item));
    triggerEvent(eventTarget, Events.ANNOTATION_LOCK_CHANGE, detail);
  }
}

export {
  setAnnotationLocked,
  getAnnotationsLocked,
  getAnnotationsLockedCount,
  unlockAllAnnotations,
  isAnnotationLocked,
  checkAndSetAnnotationLocked,
};
