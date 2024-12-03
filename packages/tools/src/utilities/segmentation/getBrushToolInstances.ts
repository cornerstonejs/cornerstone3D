import { getToolGroup } from '../../store/ToolGroupManager';
import BrushTool from '../../tools/segmentation/BrushTool';

export function getBrushToolInstances(toolGroupId: string, toolName?: string) {
  const toolGroup = getToolGroup(toolGroupId);

  if (toolGroup === undefined) {
    return;
  }

  const toolInstances = toolGroup._toolInstances;

  if (!Object.keys(toolInstances).length) {
    return;
  }

  if (toolName && toolInstances[toolName]) {
    return [toolInstances[toolName]];
  }

  // For each tool that has BrushTool as base class, set the brush size.
  const brushBasedToolInstances = Object.values(toolInstances).filter(
    (toolInstance) => toolInstance instanceof BrushTool
  ) as BrushTool[];

  return brushBasedToolInstances;
}
