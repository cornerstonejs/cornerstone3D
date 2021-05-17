/**
 * @enum ToolDataStates - This enum defines the 3 possible states available for
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

enum ToolDataStates {
  Default = '',
  Highlighted = 'Highlighted',
  Selected = 'Selected',
  Locked = 'Locked',
}

export default ToolDataStates
