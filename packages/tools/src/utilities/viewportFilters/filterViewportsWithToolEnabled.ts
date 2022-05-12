import type { Types } from '@cornerstonejs/core';
import type { IToolGroup } from '../../types';
import { ToolGroupManager } from '../../store';
import { ToolModes } from '../../enums';

const { Active, Passive, Enabled } = ToolModes;

/**
 * Given an array of viewports, returns a list of viewports that have the the specified tool enabled.
 *
 * @param viewports - An array of viewports.
 * @param toolName - The name of the tool to filter on.
 *
 * @returns A filtered array of viewports.
 */
export default function filterViewportsWithToolEnabled(
  viewports: Array<Types.IStackViewport | Types.IVolumeViewport>,
  toolName: string
): Array<Types.IStackViewport | Types.IVolumeViewport> {
  const numViewports = viewports.length;

  const viewportsWithToolEnabled = [];

  for (let vp = 0; vp < numViewports; vp++) {
    const viewport = viewports[vp];

    const toolGroup = ToolGroupManager.getToolGroupForViewport(
      viewport.id,
      viewport.renderingEngineId
    );

    if (!toolGroup) {
      continue;
    }

    const hasTool = _toolGroupHasActiveEnabledOrPassiveTool(
      toolGroup,
      toolName
    );

    if (hasTool) {
      viewportsWithToolEnabled.push(viewport);
    }
  }

  return viewportsWithToolEnabled;
}

/**
 * Given a toolGroup, return true if it contains the tool with the given `toolName` and it is
 * active, passive or enabled.
 *
 * @param toolGroup - The `toolGroup` to check.
 * @param toolName - The name of the tool.
 *
 * @returns True if the tool is enabled, passive or active in the `toolGroup`.
 */
function _toolGroupHasActiveEnabledOrPassiveTool(
  toolGroup: IToolGroup,
  toolName: string
) {
  const { toolOptions } = toolGroup;
  const tool = toolOptions[toolName];

  if (!tool) {
    return false;
  }

  const toolMode = tool.mode;

  return toolMode === Active || toolMode === Passive || toolMode === Enabled;
}
