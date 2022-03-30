import { state } from '../index';
import { IToolGroup } from '../../types';

/**
 * Return the array of tool groups
 * @returns An array of tool groups.
 */
function getAllToolGroups(): Array<IToolGroup> {
  return state.toolGroups;
}

export default getAllToolGroups;
