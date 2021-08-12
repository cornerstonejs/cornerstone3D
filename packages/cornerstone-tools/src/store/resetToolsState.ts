import { state } from './state'

/**
 * @function addTool
 *
 * @export
 * @param {BaseTool|BaseAnnotationTool} ToolClass A tool calls to instantiate.
 * @param {object} toolOptions The tool-specific configuration options for the tool.
 * @returns
 */
export default function resetToolsState(): void {
  state.tools = {}
  state.toolGroups = []
  state.synchronizers = []
  state.enabledElements = []
  state.isInteractingWithTool = false
  state.isMultiPartToolActive = false
  state.handleRadius = 6
}
