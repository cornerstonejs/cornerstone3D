/**
 * ToolDataStyleStates - This enum defines the 4 possible states available for
 *  a ToolSpecificToolData instance.
 *
 * Default:
 *   The default state for the tool data instance
 * Highlighted:
 *   The tool data should be rendered in "highlighted" mode in response to
 *   direct user interaction;
 * Selected:
 *   The tool data has been selected by the user;
 * Locked:
 *   The tool data has been locked;
 */
enum ToolDataStyleStates {
  Default = '',
  Highlighted = 'Highlighted',
  Selected = 'Selected',
  Locked = 'Locked',
}

export default ToolDataStyleStates
