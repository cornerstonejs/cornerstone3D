import {
  triggerEvent,
  eventTarget,
  utilities as csUtils,
} from '@cornerstonejs/core';
import { Events } from '../../enums';
import FrameOfReferenceSpecificAnnotationManager from './FrameOfReferenceSpecificAnnotationManager';
import { Annotations, Annotation } from '../../types/AnnotationTypes';
import { AnnotationRemovedEventDetail } from '../../types/EventTypes';
import {
  triggerAnnotationAddedForElement,
  triggerAnnotationAddedForFOR,
} from './helpers/state';

type AnnotationManagerSelector = string | HTMLDivElement;

const DEFAULT_MANAGER_UID = 'DEFAULT';

// map of all annotation managers
const annotationManagers = new Map();

annotationManagers.set(
  DEFAULT_MANAGER_UID,
  new FrameOfReferenceSpecificAnnotationManager(DEFAULT_MANAGER_UID)
);

/**
 * It adds an annotation manager to the annotationManagers map.
 * @param annotationManagerSelector - A unique identifier (string, or
 * HTMLDivElement) for the annotation manager.
 * @param annotationManager - The annotation manager that you want to add to the
 * list of annotation managers.
 */
function addAnnotationManager(annotationManagerSelector, annotationManager) {
  annotationManagers.set(annotationManagerSelector, annotationManager);
}

/**
 * It returns the default annotations manager.
 * @returns the singleton default annotations manager.
 */
function getDefaultAnnotationManager() {
  return annotationManagers.get(DEFAULT_MANAGER_UID);
}

function getAnnotationManager(
  annotationManagerSelector?: AnnotationManagerSelector
) {
  let annotationManager = annotationManagers.get(annotationManagerSelector);

  if (!annotationManager) {
    annotationManager = annotationManagers.get(DEFAULT_MANAGER_UID);
  }

  return annotationManager;
}

/**
 * Returns the annotations for a given tool in the specified frame of reference.
 * If element is provided, it will return the annotations for the viewport specific
 * annotation manager.
 *
 * @param toolName - The name of the tool.
 * @param frameOfReferenceUID - The Frame of Reference UID.
 * @param annotationManagerSelector - optional unique identifier (string, or HTMLDivElement)
 * for the annotation manager to be used, if not specified it will use the default
 * @returns The annotations corresponding to the Frame of Reference and the toolName.
 */
function getAnnotations(
  toolName: string,
  frameOfReferenceUID: string,
  annotationManagerSelector?: AnnotationManagerSelector
): Annotations {
  const annotationManager = getAnnotationManager(annotationManagerSelector);
  return annotationManager.get(frameOfReferenceUID, toolName);
}

/**
 * Add the annotation to the annotation manager. If an element is provided,
 * the annotation will be added to the viewport specific annotation manager.
 *
 * @param annotation - The annotation that is being added to the annotations manager.
 * @param annotationManagerSelector - optional unique identifier (string, or HTMLDivElement)
 * for the annotation manager to be used, if not specified it will use the default
 */
function addAnnotation(
  annotation: Annotation,
  annotationManagerSelector?: AnnotationManagerSelector
): string {
  const annotationManager = getAnnotationManager(annotationManagerSelector);

  if (annotation.annotationUID === undefined) {
    annotation.annotationUID = csUtils.uuidv4() as string;
  }

  annotationManager.addAnnotation(annotation);

  // if the annotation manager selector is an element, trigger the
  // annotation added event for that element.
  if (annotationManagerSelector instanceof HTMLElement) {
    triggerAnnotationAddedForElement(annotation, annotationManagerSelector);
  }

  // if no element is provided, render all viewports that have the
  // same frame of reference.
  triggerAnnotationAddedForFOR(annotation);

  return annotation.annotationUID;
}

/**
 * Get the number of annotations for a given tool in the specified frame of reference.
 * If no frame of reference is specified, it will return the number of annotations
 * for all frames of reference.
 *
 * @param toolName - The name of the tool
 * @param frameOfReferenceUID - The frame of reference UID
 * @param annotationManagerSelector - optional unique identifier (string, or HTMLDivElement)
 * for the annotation manager to be used, if not specified it will use the default
 * @returns The number of annotations for a given frame of reference and tool name.
 */
function getNumberOfAnnotations(
  toolName: string,
  frameOfReferenceUID?: string,
  annotationManagerSelector?: AnnotationManagerSelector
): number {
  const annotationManager = getAnnotationManager(annotationManagerSelector);
  return annotationManager.getNumberOfAnnotations(
    toolName,
    frameOfReferenceUID
  );
}

/**
 * Remove the annotation by UID of the annotation.
 * @param annotationUID - The unique identifier for the annotation.
 * @param annotationManagerSelector - optional unique identifier (string, or HTMLDivElement)
 * for the annotation manager to be used, if not specified it will use the default
 */
function removeAnnotation(
  annotationUID: string,
  annotationManagerSelector?: AnnotationManagerSelector
): void {
  const annotationManager = getAnnotationManager(annotationManagerSelector);
  const annotation = annotationManager.getAnnotation(annotationUID);

  // no need to continue in case there is no annotation.
  if (!annotation) {
    return;
  }

  annotationManager.removeAnnotation(annotationUID);

  // trigger annotation removed
  const eventType = Events.ANNOTATION_REMOVED;

  const eventDetail: AnnotationRemovedEventDetail = {
    annotation,
    annotationManagerUID: annotationManager.uid,
  };

  triggerEvent(eventTarget, eventType, eventDetail);
}

/**
 * Get the Annotation object by its UID
 * @param annotationUID - The unique identifier of the annotation.
 * @param annotationManagerSelector - optional unique identifier (string, or HTMLDivElement)
 * for the annotation manager to be used, if not specified it will use the default
 */
function getAnnotation(
  annotationUID: string,
  annotationManagerSelector?: AnnotationManagerSelector
): Annotation {
  const annotationManager = getAnnotationManager(annotationManagerSelector);
  const annotation = annotationManager.getAnnotation(annotationUID);

  return annotation;
}

/**
 * It removes all annotations from the default annotation manager
 * @param annotationManagerSelector - optional unique identifier (string, or HTMLDivElement)
 * for the annotation manager to be used, if not specified it will use the default
 */
function removeAllAnnotations(
  annotationManagerSelector?: AnnotationManagerSelector
): void {
  const annotationManager = getAnnotationManager(annotationManagerSelector);
  annotationManager.removeAllAnnotations();
}

export {
  getAnnotations,
  getNumberOfAnnotations,
  addAnnotation,
  getAnnotation,
  removeAnnotation,
  removeAllAnnotations,
  getDefaultAnnotationManager,
  addAnnotationManager,
  getAnnotationManager,
};
