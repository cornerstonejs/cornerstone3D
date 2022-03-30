/**
 * AnnotationStyleStates - This enum defines the 4 possible states available for
 *  a Annotation instance.
 *
 * Default:
 *   The default state for the annotation instance
 * Highlighted:
 *   The annotation should be rendered in "highlighted" mode in response to
 *   direct user interaction;
 * Selected:
 *   The annotation has been selected by the user;
 * Locked:
 *   The annotation has been locked;
 */
enum AnnotationStyleStates {
  Default = '',
  Highlighted = 'Highlighted',
  Selected = 'Selected',
  Locked = 'Locked',
}

export default AnnotationStyleStates;
