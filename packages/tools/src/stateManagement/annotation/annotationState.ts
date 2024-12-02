import { utilities as csUtils } from '@cornerstonejs/core';
import type { Annotations, Annotation } from '../../types/AnnotationTypes';
import type { AnnotationGroupSelector, IAnnotationManager } from '../../types';
import {
  triggerAnnotationAddedForElement,
  triggerAnnotationAddedForFOR,
  triggerAnnotationRemoved,
} from './helpers/state';

// our default annotation manager
let defaultManager;

/**
 * It returns the default annotations manager.
 * @returns the singleton default annotations manager.
 */
function getAnnotationManager() {
  return defaultManager;
}

/**
 * Set the annotation manager to be used for rendering, adding, removing, etc.
 * @param annotationManager - The annotation manager to be used
 */
function setAnnotationManager(annotationManager: IAnnotationManager) {
  defaultManager = annotationManager;
}

/**
 * Returns the annotations for a given tool with the provided options that is
 * used to filter annotations based on the annotation manager.
 *
 * In our default implementation, the options are the element and/or the FrameOfReferenceUID.
 * Hence, the getAnnotations function will return the annotations for the given tool
 * that are associated with the FrameOfReferenceUID.
 *
 * @param toolName - The name of the tool.
 * @param annotationGroupSelector - element or FrameOfReferenceUID that is used
 * to group annotations in the annotation manager.
 * @returns The annotations corresponding to the Frame of Reference and the toolName.
 */
function getAnnotations(
  toolName: string,
  annotationGroupSelector: AnnotationGroupSelector
): Annotations {
  const manager = getAnnotationManager();
  const groupKey = manager.getGroupKey(annotationGroupSelector);
  return manager.getAnnotations(groupKey, toolName) as Annotations;
}

/**
 * Get the Annotation object by its UID
 * @param annotationUID - The unique identifier of the annotation.
 */
function getAnnotation(annotationUID: string): Annotation {
  const manager = getAnnotationManager();
  return manager.getAnnotation(annotationUID);
}

function getAllAnnotations(): Annotations {
  const manager = getAnnotationManager();
  return manager.getAllAnnotations();
}

/**
 * Removes the association between the annotation passed as parameter and its
 * parent in case it has one (eg: contour holes).
 * @param annotation - Annotation
 */
function clearParentAnnotation(annotation: Annotation): void {
  const { annotationUID: childUID, parentAnnotationUID } = annotation;

  if (!parentAnnotationUID) {
    return;
  }

  const parentAnnotation = getAnnotation(parentAnnotationUID);
  const childUIDIndex = parentAnnotation.childAnnotationUIDs.indexOf(childUID);

  parentAnnotation.childAnnotationUIDs.splice(childUIDIndex, 1);
  annotation.parentAnnotationUID = undefined;
}

/**
 * Creates a parent/child association between annotations.
 * A annotation may have only one parent and multiple children (eg: a contour
 * may have multiple holes in it).
 * @param parentAnnotation - Parent annotation
 * @param childAnnotation - Child annotation
 */
function addChildAnnotation(
  parentAnnotation: Annotation,
  childAnnotation: Annotation
): void {
  const { annotationUID: parentUID } = parentAnnotation;
  const { annotationUID: childUID } = childAnnotation;

  // Make sure it is not associated with any other tool
  clearParentAnnotation(childAnnotation);

  if (!parentAnnotation.childAnnotationUIDs) {
    parentAnnotation.childAnnotationUIDs = [];
  }

  // Check if it is already a child
  if (parentAnnotation.childAnnotationUIDs.includes(childUID)) {
    return;
  }

  parentAnnotation.childAnnotationUIDs.push(childUID);
  childAnnotation.parentAnnotationUID = parentUID;
}

/**
 * Returns the parent annotation of a given one since annotations can be
 * associated in a parent/child way (eg: polyline holes)
 * @param annotation - Annotation
 * @returns Parent annotation
 */
function getParentAnnotation(annotation: Annotation) {
  return annotation.parentAnnotationUID
    ? getAnnotation(annotation.parentAnnotationUID)
    : undefined;
}

/**
 * Returns all children annotation of a given one since annotations can be
 * associated in a parent/child way (eg: polyline holes)
 * @param annotation - Annotation
 * @returns Child annotations
 */
function getChildAnnotations(annotation: Annotation) {
  return (
    annotation.childAnnotationUIDs?.map((childAnnotationUID) =>
      getAnnotation(childAnnotationUID)
    ) ?? []
  );
}

/**
 * Add the annotation to the annotation manager along with the options that is
 * used to filter the annotation manager and the annotation group that
 * the annotation belongs to.
 *
 * As a result, our default implementation will add the annotation to the
 * default manager using the FrameOfReferenceUID as the group key.
 *
 * @param annotation - The annotation that is being added to the annotations manager.
 * @param annotationGroupSelector - element or FrameOfReferenceUID that is used
 * to group annotations in the annotation manager.
 */
function addAnnotation(
  annotation: Annotation,
  annotationGroupSelector: AnnotationGroupSelector
): string {
  if (!annotation.annotationUID) {
    annotation.annotationUID = csUtils.uuidv4() as string;
  }

  const manager = getAnnotationManager();

  // if the annotation manager selector is an element, trigger the
  // annotation added event for that element.
  if (annotationGroupSelector instanceof HTMLDivElement) {
    const groupKey = manager.getGroupKey(annotationGroupSelector);
    manager.addAnnotation(annotation, groupKey);
    triggerAnnotationAddedForElement(annotation, annotationGroupSelector);
  } else {
    // if no element is provided, render all viewports that have the
    // same frame of reference.
    // Todo: we should do something else here for other types of annotation managers.
    manager.addAnnotation(annotation, undefined);
    triggerAnnotationAddedForFOR(annotation);
  }

  return annotation.annotationUID;
}

/**
 * Get the number of annotations for a given tool with the provided options that is
 * used to filter annotations based on the annotation manager.
 *
 * In our default implementation, the options are the element and/or the FrameOfReferenceUID.
 * Hence, the getNumberOfAnnotations function will return the number of annotations for the given tool
 * that are associated with the FrameOfReferenceUID.
 *
 * @param toolName - The name of the tool
 * @param annotationGroupSelector - element or FrameOfReferenceUID that is used
 * to group annotations in the annotation manager.
 *
 */
function getNumberOfAnnotations(
  toolName: string,
  annotationGroupSelector: AnnotationGroupSelector
): number {
  const manager = getAnnotationManager();
  const groupKey = manager.getGroupKey(annotationGroupSelector);

  return manager.getNumberOfAnnotations(groupKey, toolName);
}

/**
 * Remove the annotation by UID of the annotation.
 * @param annotationUID - The unique identifier for the annotation.
 */
function removeAnnotation(annotationUID: string): void {
  if (!annotationUID) {
    return;
  }
  const manager = getAnnotationManager();
  const annotation = manager.getAnnotation(annotationUID);

  // no need to continue in case there is no annotation.
  if (!annotation) {
    return;
  }

  // Remove all child annotations first
  annotation.childAnnotationUIDs?.forEach((childAnnotationUID) =>
    removeAnnotation(childAnnotationUID)
  );

  manager.removeAnnotation(annotationUID);

  triggerAnnotationRemoved({ annotation, annotationManagerUID: manager.uid });
}

/**
 * It removes all annotations from the default annotation manager
 */
function removeAllAnnotations(): void {
  const manager = getAnnotationManager();
  const removedAnnotations = manager.removeAllAnnotations();

  for (const annotation of removedAnnotations) {
    triggerAnnotationRemoved({
      annotation,
      annotationManagerUID: manager.uid,
    });
  }
}

/**
 * Removes all annotations associated with the specified group (FrameOfReferenceUID) and tool, or
 * all annotations for the group (FrameOfReferenceUID) if the tool name is not provided.
 * @param toolName - Optional. The name of the tool to remove annotations for.
 * @param annotationGroupSelector - The group (FrameOfReferenceUID) to remove annotations for.
 */
function removeAnnotations(
  toolName: string,
  annotationGroupSelector: AnnotationGroupSelector
): void {
  const manager = getAnnotationManager();
  const groupKey = manager.getGroupKey(annotationGroupSelector);
  const removedAnnotations = manager.removeAnnotations(groupKey, toolName);

  for (const annotation of removedAnnotations) {
    triggerAnnotationRemoved({
      annotation,
      annotationManagerUID: manager.uid,
    });
  }
}

/**
 * Invalidate current and all parent annotations (eg: contour holes)
 * @param annotation - Annotation
 */
function invalidateAnnotation(annotation: Annotation): void {
  let currAnnotation = annotation;

  while (currAnnotation) {
    currAnnotation.invalidated = true;

    currAnnotation = currAnnotation.parentAnnotationUID
      ? getAnnotation(currAnnotation.parentAnnotationUID)
      : undefined;
  }
}

export {
  getAllAnnotations,
  getAnnotations,
  getParentAnnotation,
  getChildAnnotations,
  clearParentAnnotation,
  addChildAnnotation,
  getNumberOfAnnotations,
  addAnnotation,
  removeAnnotation,
  removeAnnotations,
  removeAllAnnotations,
  // annotation manager
  setAnnotationManager,
  getAnnotationManager,
  invalidateAnnotation,
  getAnnotation,
};
