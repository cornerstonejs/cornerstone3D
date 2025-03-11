import type { Annotation } from '../types/AnnotationTypes';
import { triggerAnnotationModified } from '../stateManagement/annotation/helpers/state';
import { ChangeTypes } from '../enums';

export default function setAnnotationLabel(
  annotation: Annotation,
  element: HTMLDivElement,
  updatedLabel: string
) {
  annotation.data.label = updatedLabel;
  triggerAnnotationModified(annotation, element, ChangeTypes.LabelChange);
}
