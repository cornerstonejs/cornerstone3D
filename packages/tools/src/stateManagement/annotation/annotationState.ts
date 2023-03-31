import {
  triggerEvent,
  eventTarget,
  utilities as csUtils,
} from '@cornerstonejs/core';
import { Events } from '../../enums';
import { defaultFrameOfReferenceSpecificAnnotationManager } from './FrameOfReferenceSpecificAnnotationManager';
import { Annotations, Annotation } from '../../types/AnnotationTypes';
import { AnnotationRemovedEventDetail } from '../../types/EventTypes';
import { AnnotationGroupSelector } from '../../types';
import {
  triggerAnnotationAddedForElement,
  triggerAnnotationAddedForFOR,
} from './helpers/state';

// our default annotation manager
let defaultManager = defaultFrameOfReferenceSpecificAnnotationManager;

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
function setAnnotationManager(annotationManager) {
  defaultManager = annotationManager;
}

// set back to default frameOfReferenceSpecificAnnotationManager
function resetAnnotationManager() {
  defaultManager = defaultFrameOfReferenceSpecificAnnotationManager;
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
  if (annotation.annotationUID === undefined) {
    annotation.annotationUID = csUtils.uuidv4() as string;
  }

  const manager = getAnnotationManager();
  const groupKey = manager.getGroupKey(annotationGroupSelector);

  manager.addAnnotation(annotation, groupKey);

  // if the annotation manager selector is an element, trigger the
  // annotation added event for that element.
  if (annotationGroupSelector instanceof HTMLDivElement) {
    triggerAnnotationAddedForElement(annotation, annotationGroupSelector);
  }

  // if no element is provided, render all viewports that have the
  // same frame of reference.
  // Todo: we should do something else here for other types of annotation managers.
  triggerAnnotationAddedForFOR(annotation);

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
  const manager = getAnnotationManager();
  const annotation = manager.getAnnotation(annotationUID);

  // no need to continue in case there is no annotation.
  if (!annotation) {
    return;
  }

  manager.removeAnnotation(annotationUID);

  // trigger annotation removed
  const eventType = Events.ANNOTATION_REMOVED;

  const eventDetail: AnnotationRemovedEventDetail = {
    annotation,
    annotationManagerUID: manager.uid,
  };

  triggerEvent(eventTarget, eventType, eventDetail);
}

/**
 * Get the Annotation object by its UID
 * @param annotationUID - The unique identifier of the annotation.
 */
function getAnnotation(annotationUID: string): Annotation {
  const manager = getAnnotationManager();
  const annotation = manager.getAnnotation(annotationUID);

  return annotation;
}

/**
 * It removes all annotations from the default annotation manager
 */
function removeAllAnnotations(): void {
  const manager = getAnnotationManager();
  manager.removeAllAnnotations();
}

export {
  getAnnotations,
  getNumberOfAnnotations,
  addAnnotation,
  getAnnotation,
  removeAnnotation,
  removeAllAnnotations,
  // annotation manager
  setAnnotationManager,
  getAnnotationManager,
  resetAnnotationManager,
};
