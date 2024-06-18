import { state } from '../index.js';
import { IToolGroup } from '../../types/index.js';

/**
 * Return the array of tool groups
 * @returns An array of tool groups.
 */
function getAllToolGroups(): Array<IToolGroup> {
  return state.toolGroups;
}

export default getAllToolGroups;
