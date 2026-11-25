import { utilities } from '@cornerstonejs/core';
import { ToolModes } from '../../enums';
import type { BaseTool } from '../../tools';
import { state } from '../state';
// ToolGroups function entirely by their "state" being queried and leveraged
// removing a ToolGroup from state is equivalent to killing it

const log = utilities.logger.toolsLog.getLogger(
  'store.ToolGroupManager.destroyToolGroup'
);

/**
 * Given a tool group Id, destroy the toolGroup. It will also cleanup all segmentations
 * associated with that tool group too. Each tool of the group that is not
 * disabled is disabled first (`onSetToolDisabled`, without the event and the
 * render of `setToolDisabled`), so it removes the listeners that it keeps
 * while it is enabled, passive or active, and a tool group made later under
 * the same id does not reach the old tools. A tool whose disable throws, as
 * one that restores the view of a viewport whose data the cache no longer
 * holds, is logged and the destroy goes on.
 *
 * @param toolGroupId - The Id of the tool group to be destroyed.
 */
function destroyToolGroup(toolGroupId: string): void {
  const toolGroupIndex = state.toolGroups.findIndex(
    (tg) => tg.id === toolGroupId
  );

  if (toolGroupIndex > -1) {
    disableTools(
      state.toolGroups[toolGroupIndex].getToolInstances() as Record<
        string,
        BaseTool
      >
    );
    state.toolGroups.splice(toolGroupIndex, 1);
  }
}

/** Disables each tool that is enabled, passive or active. */
function disableTools(toolInstances: Record<string, BaseTool>): void {
  Object.entries(toolInstances).forEach(([toolName, toolInstance]) => {
    if (toolInstance.mode === ToolModes.Disabled) {
      return;
    }

    toolInstance.mode = ToolModes.Disabled;

    try {
      (
        toolInstance as BaseTool & { onSetToolDisabled?: () => void }
      ).onSetToolDisabled?.();
    } catch (error) {
      log.warn(
        `The tool ${toolName} failed to disable while its tool group was destroyed`,
        error
      );
    }
  });
}

export default destroyToolGroup;
