import AnnotationGroupSelector from './AnnotationGroupSelector';
import {
  Annotation,
  Annotations,
  GroupSpecificAnnotations,
} from './AnnotationTypes';

/**
 * The interface for any annotation manager (custom or default)
 */
interface IAnnotationManager {
  /**
   * Annotations are stored in Groups. Our default annotation manager
   * groups the annotations based on FrameOfReferenceUID, but it is possible
   * that you can group them based on different aspects or you only have one group
   * totally.
   *
   * This function returns the group key associated with the specified
   * annotationGroupSelector. The annotationGroupSelector can be an HTML element
   * or a string.
   *
   * @param annotationGroupSelector - The annotation group selector.
   * @returns The group key associated with the element.
   */
  getGroupKey: (annotationGroupSelector: AnnotationGroupSelector) => string;

  /**
   * Adds an annotation to the specified group.
   * @param annotation - The annotation to add.
   * @param groupKey - The group key to add the annotation to.
   */
  addAnnotation: (annotation: Annotation, groupKey: string) => void;

  /**
   * Returns the annotations associated with the specified group, if the
   * toolName is specified, it will return the annotations for the specified
   * tool.
   * @param groupKey - The group key to retrieve annotations for.
   * @param toolName - The name of the tool to retrieve annotations for.
   *
   * @returns The annotations associated with the specified group and tool.
   */
  getAnnotations: (
    groupKey: string,
    toolName?: string
  ) => GroupSpecificAnnotations | Annotations;

  /**
   * Returns the annotation with the specified UID.
   * @param annotationUID - The UID of the annotation to retrieve.
   * @returns The annotation with the specified UID.
   */
  getAnnotation: (annotationUID: string) => Annotation;

  /**
   * Removes the annotation with the specified UID.
   * @param annotationUID - The UID of the annotation to remove.
   */
  removeAnnotation: (annotationUID: string) => void;

  /**
   * Removes all annotations associated with the specified group.
   * @param groupKey - The group key to remove annotations for.
   */
  removeAnnotations: (groupKey: string) => void;

  /**
   * Removes all annotations.
   */
  removeAllAnnotations: () => void;

  /**
   * Returns the number of annotations associated with the specified group.
   * If the toolName is specified, it will return the number of annotations
   *
   * @param groupKey - The group key to count annotations for.
   * @param toolName - The name of the tool to count annotations for.
   * @returns The number of annotations associated with the specified group.
   */
  getNumberOfAnnotations: (groupKey: string, toolName?: string) => number;

  /**
   * Returns the total number of annotations across all groups.
   * @returns The total number of annotations across all groups.
   */
  getNumberOfAllAnnotations: () => number;
}

export default IAnnotationManager;
