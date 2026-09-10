import { state } from '../state';
import ToolGroup from './ToolGroup';
import type { IToolGroup } from '../../types';
import { utilities as cornerstoneUtilities } from '@cornerstonejs/core';

const cs3dLogger = cornerstoneUtilities.logger.toolsLog.getLogger(
  'store.ToolGroupManager.createToolGroup'
);

/**
 * Create a new tool group with the given name. ToolGroups are the new way
 * in Cornerstone3DTools to share tool configuration, state (enabled, disabled, etc.)
 * across a set of viewports.
 *
 * @param toolGroupId - The unique ID of the tool group.
 * @returns A reference to the tool group that was created.
 */
function createToolGroup(toolGroupId: string): IToolGroup | undefined {
  // Exit early if ID conflict
  const toolGroupWithIdExists = state.toolGroups.some(
    (tg) => tg.id === toolGroupId
  );

  if (toolGroupWithIdExists) {
    cs3dLogger.warn(`'${toolGroupId}' already exists.`);
    return;
  }

  const toolGroup = new ToolGroup(toolGroupId);

  // Update state
  state.toolGroups.push(toolGroup);

  // Return reference
  return toolGroup;
}

export default createToolGroup;
