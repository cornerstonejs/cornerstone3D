import { getToolGroup } from '../../store/ToolGroupManager';
import BrushTool from '../../tools/segmentation/BrushTool';

export default function getBrushToolInstances(toolGroupId) {
  const toolGroup = getToolGroup(toolGroupId);

  if (toolGroup === undefined) {
    return;
  }

  const toolInstances = toolGroup._toolInstances;

  if (!Object.keys(toolInstances).length) {
    return;
  }

  // For each tool that has BrushTool as base class, set the brush size.
  const brushBasedToolInstances = Object.values(toolInstances).filter(
    (toolInstance) => toolInstance instanceof BrushTool
  ) as BrushTool[];

  return brushBasedToolInstances;
}
