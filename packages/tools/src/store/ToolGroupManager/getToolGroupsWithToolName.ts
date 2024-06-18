import { state } from '../index.js';
import { IToolGroup } from '../../types/index.js';
import { ToolModes } from '../../enums/index.js';

const MODES = [ToolModes.Active, ToolModes.Passive, ToolModes.Enabled];

/**
 * Returns the toolGroups that has the given toolName as active, passive
 * or enabled.
 * @param toolName - The name of the tool
 * @returns An array of tool groups.
 */
function getToolGroupsWithToolName(toolName: string): IToolGroup[] | [] {
  return state.toolGroups.filter(({ toolOptions }) => {
    const toolGroupToolNames = Object.keys(toolOptions);

    for (let i = 0; i < toolGroupToolNames.length; i++) {
      if (toolName !== toolGroupToolNames[i]) {
        continue;
      }

      /* filter out tools that don't have options */
      if (!toolOptions[toolName]) {
        continue;
      }

      if (MODES.includes(toolOptions[toolName].mode)) {
        return true;
      }
    }
    return false;
  });
}

export default getToolGroupsWithToolName;
