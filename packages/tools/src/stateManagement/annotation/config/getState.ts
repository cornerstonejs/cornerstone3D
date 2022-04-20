import { Annotation } from '../../../types';
import { isAnnotationLocked } from '../annotationLocking';
import { isAnnotationSelected } from '../annotationSelection';
import { AnnotationStyleStates } from '../../../enums';

/**
 * Given a Annotation object, return the annotationStyle State that it
 * should be in based on its data
 * @param annotation - The annotation that we want to style.
 * @returns The state of the annotation whether it is Default, Highlighted, Locked, or Selected.
 */
function getState(annotation?: Annotation): AnnotationStyleStates {
  if (annotation) {
    if (annotation.data && annotation.highlighted)
      return AnnotationStyleStates.Highlighted;
    if (isAnnotationSelected(annotation.annotationUID))
      return AnnotationStyleStates.Selected;

    // Todo: make annotation lock api not to rely on the annotation itself
    if (isAnnotationLocked(annotation)) return AnnotationStyleStates.Locked;
  }

  return AnnotationStyleStates.Default;
}

export default getState;
