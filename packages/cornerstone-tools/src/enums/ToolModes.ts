/**
 * ToolModes - This enum defines the 4 tool states which are available.
 *
 * Active:
 * - Can be actively used by mouse/touch events mapped to its `ToolBinding`s.
 * - Can add data if an annotation tool.
 * - Can be passively interacted by grabbing a tool or its handles.
 * - Renders data if the tool has a `renderAnnotation` method.
 * Passive:
 * - Can be passively interacted by grabbing a tool or its handles.
 * - Renders data if the tool has a `renderAnnotation` method.
 * Enabled:
 * - Renders data if the tool has a `renderAnnotation` method.
 * Disabled:
 * - Annotation does not render.
 */
enum ToolModes {
  Active = 'Active',
  Passive = 'Passive',
  Enabled = 'Enabled',
  Disabled = 'Disabled',
}

export default ToolModes
