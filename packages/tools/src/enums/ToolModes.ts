/**
 * ToolModes - This enum defines the 4 tool states which are available.
 */
enum ToolModes {
  /**
   * Active:
   * - Can be actively used by mouse/touch events mapped to its `ToolBinding`s.
   * - Can add data if an annotation tool.
   * - Can be passively interacted by grabbing a tool or its handles.
   * - Renders data if the tool has a `renderAnnotation` method.
   */
  Active = 'Active',
  /**
   * Passive:
   * - Can be passively interacted by grabbing a tool or its handles.
   * - Renders data if the tool has a `renderAnnotation` method.
   */
  Passive = 'Passive',
  /**
   * Enabled:
   * - Renders data if the tool has a `renderAnnotation` method.
   */
  Enabled = 'Enabled',
  /**
   * Disabled:
   * - Annotation does not render.
   */
  Disabled = 'Disabled',
}

export default ToolModes;
