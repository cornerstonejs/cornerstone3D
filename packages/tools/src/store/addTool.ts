import { state } from './state';

/**
 * Adds the tool class to the cornerstoneTools to be used later. This function
 * should be called before creating the toolGroups and adding tools and setting their mode.
 * The flow is:
 * - addTool(ToolClass) // where ToolClass is the tool constructor imported from CornerstoneTools or created by a 3rd party
 * - createToolGroup(toolGroupId)
 * - toolGroup.addTool(${toolName}) // NOT THE TOOL CLASS
 * - toolGroup.setToolActive(${toolName})
 *
 * @param ToolClass - A tool calls to instantiate.
 * @param toolOptions - The tool-specific configuration options for the tool.
 * @returns
 */
export function addTool(ToolClass): void {
  // Check if tool exists and name is not undefined
  const toolName = ToolClass.toolName;
  const toolAlreadyAdded = state.tools[toolName] !== undefined;

  if (!toolName) {
    throw new Error(`No Tool Found for the ToolClass ${ToolClass.name}`);
  }

  if (toolAlreadyAdded) {
    throw new Error(`${toolName} has already been added globally`);
  }

  // Stores the toolNames and ToolClass to be instantiated in the toolGroup on toolGroup.addTool
  state.tools[toolName] = {
    toolClass: ToolClass,
  };
}

/**
 * Check if a given tool is already registered
 * @param ToolClass - A tool class to check
 * @returns True if the tool is alredy registered or false otherwise
 */
export function hasTool(ToolClass): boolean {
  const toolName = ToolClass.toolName;

  return !!(toolName && state.tools[toolName]);
}

/**
 * Removes the tool class from the cornerstoneTools.
 *
 * @param ToolClass - A tool calls to instantiate.
 */
export function removeTool(ToolClass): void {
  const toolName = ToolClass.toolName;

  if (!toolName) {
    throw new Error(`No tool found for: ${ToolClass.name}`);
  }

  if (!state.tools[toolName] !== undefined) {
    delete state.tools[toolName];
  } else {
    throw new Error(
      `${toolName} cannot be removed because it has not been added`
    );
  }
}

export default addTool;
