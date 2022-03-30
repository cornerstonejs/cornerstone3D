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
  element?: Types.IEnabledElement | HTMLElement
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
function getAnnotations(element: HTMLElement, toolName: string): Annotations {
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
 * @param element - HTMLElement
 * @param annotation - The annotation that is being added to the annotations manager.
 */
function addAnnotation(element: HTMLElement, annotation: Annotation): void {
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
}

/**
 * Remove the annotation by UID of the annotation.
 * @param element - HTMLElement
 * @param annotationUID - The unique identifier for the annotation.
 */
function removeAnnotation(element: HTMLElement, annotationUID: string): void {
  const annotationManager = getViewportSpecificAnnotationManager(element);

  const annotation = annotationManager.getAnnotation(annotationUID);
  annotationManager.removeAnnotation(annotationUID);

  // trigger annotation removed
  const enabledElement = getEnabledElement(element);
  const { renderingEngine } = enabledElement;
  const { viewportId } = enabledElement;

  const eventType = Events.ANNOTATION_REMOVED;

  const eventDetail: AnnotationRemovedEventDetail = {
    annotation,
    viewportId,
    renderingEngineId: renderingEngine.id,
  };

  triggerEvent(eventTarget, eventType, eventDetail);
}

/**
 * Get the Annotation object by its UID
 * @param annotationUID - The unique identifier of the annotation.
 * @param element - The element that the tool is being used on.
 * @returns A Annotation object.
 */
function getAnnotation(
  annotationUID: string,
  element?: HTMLElement
): Annotation {
  const annotationManager = getViewportSpecificAnnotationManager(element);
  const annotation = annotationManager.getAnnotation(annotationUID);

  return annotation;
}

export {
  getAnnotations,
  addAnnotation,
  getAnnotation,
  removeAnnotation,
  getViewportSpecificAnnotationManager,
  getDefaultAnnotationManager,
};
