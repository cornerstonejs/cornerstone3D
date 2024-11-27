import type { Annotation } from '../../types';
import { defaultFrameOfReferenceSpecificAnnotationManager } from './FrameOfReferenceSpecificAnnotationManager';

/**
 * Get the Annotation object by its UID
 * @param annotationUID - The unique identifier of the annotation.
 */
export function getAnnotation(annotationUID: string): Annotation {
  const manager = defaultFrameOfReferenceSpecificAnnotationManager;
  const annotation = manager.getAnnotation(annotationUID);

  return annotation;
}
