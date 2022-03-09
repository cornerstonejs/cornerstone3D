import { state } from './state'

/**
 * Adds the tool class to the cornerstoneTools to be used later. This function
 * should be called before creating the toolGroups and adding tools and setting their mode.
 * The flow is:
 * - addTool(ToolClass) // where ToolClass is the tool constructor imported from CornerstoneTools or created by a 3rd party
 * - createToolGroup(toolGroupUID)
 * - toolGroup.addTool(${toolName}) // NOT THE TOOL CLASS
 * - toolGroup.setToolActive(${toolName})
 *
 * @param ToolClass - A tool calls to instantiate.
 * @param toolOptions - The tool-specific configuration options for the tool.
 * @returns
 */
export function addTool(ToolClass): void {
  // Instantiating the ToolClass only to see if it exists and name is not undefined
  const tool = new ToolClass()
  const hasToolName = typeof tool.name !== 'undefined' && tool.name !== ''
  const toolAlreadyAdded = state.tools[tool.name] !== undefined

  if (!hasToolName) {
    throw new Error(`No Tool Found for the ToolClass`)
  }

  if (toolAlreadyAdded) {
    throw new Error(`${tool.name} has already been added globally`)
  }

  // Stores the toolNames and ToolClass to be instantiated in the toolGroup on toolGroup.addTool
  state.tools[tool.name] = {
    toolClass: ToolClass,
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
