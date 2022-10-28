import {
  getEnabledElement,
  triggerEvent,
  eventTarget,
  utilities as csUtils,
} from '@cornerstonejs/core';
import { Events } from '../../enums';
import { Types } from '@cornerstonejs/core';
import { defaultFrameOfReferenceSpecificAnnotationManager } from './FrameOfReferenceSpecificAnnotationManager';
import { Annotations, Annotation } from '../../types/AnnotationTypes';

import {
  AnnotationAddedEventDetail,
  AnnotationRemovedEventDetail,
} from '../../types/EventTypes';

/**
 * It returns the default annotations manager.
 * @returns the singleton default annotations manager.
 */
function getDefaultAnnotationManager() {
  return defaultFrameOfReferenceSpecificAnnotationManager;
}

/**
 * Given an element, return the FrameOfReferenceSpecificStateManager for that
 * element
 * @param element - The element that the state manager is managing the state of.
 * @returns The default state manager
 */
function getViewportSpecificAnnotationManager(
  element?: Types.IEnabledElement | HTMLDivElement
) {
  // TODO:
  // We may want multiple FrameOfReferenceSpecificStateManagers.
  // E.g. displaying two different radiologists annotations on the same underlying data/FoR.

  // Just return the default for now.

  return defaultFrameOfReferenceSpecificAnnotationManager;
}

/**
 * Returns the annotations for the `FrameOfReference` of the `Viewport`
 * being viewed by the cornerstone3D enabled `element`.
 *
 * @param element - The HTML element.
 * @param toolName - The name of the tool.
 * @returns The annotations corresponding to the Frame of Reference and the toolName.
 */
function getAnnotations(
  element: HTMLDivElement,
  toolName: string
): Annotations {
  const enabledElement = getEnabledElement(element);
  const annotationManager =
    getViewportSpecificAnnotationManager(enabledElement);
  const { FrameOfReferenceUID } = enabledElement;

  return annotationManager.get(FrameOfReferenceUID, toolName);
}

/**
 * Add the annotation to the annotations for the `FrameOfReference` of the `Viewport`
 * being viewed by the cornerstone3D enabled `element`.
 *
 * @param element - HTMLDivElement
 * @param annotation - The annotation that is being added to the annotations manager.
 */
function addAnnotation(
  element: HTMLDivElement,
  annotation: Annotation
): string {
  const annotationManager = getViewportSpecificAnnotationManager(element);

  if (annotation.annotationUID === undefined) {
    annotation.annotationUID = csUtils.uuidv4() as string;
  }

  annotationManager.addAnnotation(annotation);

  const enabledElement = getEnabledElement(element);
  const { renderingEngine } = enabledElement;
  const { viewportId } = enabledElement;

  const eventType = Events.ANNOTATION_ADDED;

  const eventDetail: AnnotationAddedEventDetail = {
    annotation,
    viewportId,
    renderingEngineId: renderingEngine.id,
  };

  triggerEvent(eventTarget, eventType, eventDetail);

  return annotation.annotationUID;
}

/**
 * Get the number of annotations for a given tool in the specified frame of reference.
 * If no frame of reference is specified, it will return the number of annotations
 * for all frames of reference.
 *
 * @param toolName - The name of the tool
 * @param frameOfReferenceUID - The frame of reference UID
 *
 * @returns The number of annotations for a given frame of reference and tool name.
 */
function getNumberOfAnnotations(
  toolName: string,
  frameOfReferenceUID?: string
): number {
  const annotationManager = getDefaultAnnotationManager();
  return annotationManager.getNumberOfAnnotations(
    toolName,
    frameOfReferenceUID
  );
}

/**
 * Remove the annotation by UID of the annotation.
 * @param element - HTMLDivElement
 * @param annotationUID - The unique identifier for the annotation.
 */
function removeAnnotation(
  annotationUID: string,
  element?: HTMLDivElement
): void {
  let annotationManager = getDefaultAnnotationManager();
  if (element) {
    annotationManager = getViewportSpecificAnnotationManager(element);
  }

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
 * @param element - The element that the tool is being used on.
 * @returns A Annotation object
 */
function getAnnotation(
  annotationUID: string,
  element?: HTMLDivElement
): Annotation {
  const annotationManager = getViewportSpecificAnnotationManager(element);
  const annotation = annotationManager.getAnnotation(annotationUID);

  return annotation;
}

/**
 * It removes all annotations from the default annotation manager
 * @param element - Optional element to get the annotation manager from, if not
 * specified it will use the default annotation manager.
 */
function removeAllAnnotations(element?: HTMLDivElement): void {
  let annotationManager = getDefaultAnnotationManager();
  if (element) {
    annotationManager = getViewportSpecificAnnotationManager(element);
  }

  annotationManager.removeAllAnnotations();
}

export {
  getAnnotations,
  getNumberOfAnnotations,
  addAnnotation,
  getAnnotation,
  removeAnnotation,
  removeAllAnnotations,
  getViewportSpecificAnnotationManager,
  getDefaultAnnotationManager,
};
