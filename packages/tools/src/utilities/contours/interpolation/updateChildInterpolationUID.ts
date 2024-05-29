import type { InterpolationROIAnnotation } from '../../../types/ToolSpecificAnnotationTypes.js';
import * as annotationState from '../../../stateManagement/annotation/index.js';

/**
 * Updates child annotation interpolation UIDs to be the parent interpolationUID
 * followed by `-{index}` where the index is the hole/child index.  This causes
 * child annotations to be matched positionally within the parent.
 */
export default function updateChildInterpolationUID(
  annotation: InterpolationROIAnnotation
) {
  const { parentAnnotationUID, annotationUID } = annotation;
  if (!parentAnnotationUID) {
    return annotation.interpolationUID;
  }
  const parentAnnotation = annotationState.state.getAnnotation(
    parentAnnotationUID
  ) as InterpolationROIAnnotation;
  const { interpolationUID } = parentAnnotation;
  const index = parentAnnotation.childAnnotationUIDs.indexOf(annotationUID);
  annotation.interpolationUID = `${interpolationUID}-${index}`;
  return annotation.interpolationUID;
}
