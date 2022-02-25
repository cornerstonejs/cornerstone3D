import { state } from './state'

/**
 * @function addTool
 *
 * @export
 * @param {BaseTool|BaseAnnotationTool} ToolClass A tool calls to instantiate.
 * @param {object} toolOptions The tool-specific configuration options for the tool.
 * @returns
 */
export function addTool(ToolClass, toolOptions) {
  const tool = new ToolClass(toolOptions)
  const hasToolName = typeof tool.name !== 'undefined' && tool.name !== ''
  const toolAlreadyAdded = state.tools[tool.name] !== undefined

  if (!hasToolName) {
    throw new Error(
      `Tool with configuration did not produce a toolName: ${toolOptions}`
    )
  }

  if (toolAlreadyAdded) {
    throw new Error(`${tool.name} has already been added globally`)
  }

  state.tools[tool.name] = {
    toolClass: ToolClass,
    toolOptions,
  }
}

export function removeTool(ToolClass, toolOptions = {}) {
  const tool = new ToolClass(toolOptions)
  const hasToolName = typeof tool.name !== 'undefined' && tool.name !== ''

  if (!hasToolName) {
    throw new Error(
      `Tool with configuration did not produce a toolName: ${toolOptions}`
    )
  }

  if (!state.tools[tool.name] !== undefined) {
    delete state.tools[tool.name]
  } else {
    throw new Error(
      `${tool.name} cannot be removed because it has not been added`
    )
  }
}

export default addTool
