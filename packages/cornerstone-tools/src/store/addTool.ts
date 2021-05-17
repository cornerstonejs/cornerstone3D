import { state } from './state'

/**
 * @function addTool
 *
 * @export
 * @param {BaseTool|BaseAnnotationTool} ToolClass A tool calls to instantiate.
 * @param {object} toolOptions The tool-specific configuration options for the tool.
 * @returns
 */
export default function addTool(ToolClass, toolOptions) {
  const tool = new ToolClass(toolOptions)
  const hasToolName = typeof tool.name !== 'undefined' && tool.name !== ''
  const toolAlreadyAdded = state.tools[tool.name] !== undefined

  if (!hasToolName) {
    console.warn(
      'Tool with configuration did not produce a toolName: ',
      toolOptions
    )
    return
  }

  if (toolAlreadyAdded) {
    console.warn(`${tool.name} has already been added globally`)

    return
  }

  state.tools[tool.name] = {
    toolClass: ToolClass,
    toolOptions,
  }
}
