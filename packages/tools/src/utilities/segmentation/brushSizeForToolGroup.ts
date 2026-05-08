import { getToolGroup } from '../../store/ToolGroupManager';
import type BrushTool from '../../tools/segmentation/BrushTool';
import triggerAnnotationRenderForViewportIds from '../triggerAnnotationRenderForViewportIds';
import { getBrushToolInstances } from './getBrushToolInstances';

/**
 * Sets the brush size for all brush-based tools in a given tool group.
 * @param toolGroupId - The ID of the tool group to set the brush size for.
 * @param brushSize - The new brush size to set.
 * @param toolName - The name of the specific tool to set the brush size for (optional)
 * If not provided, all brush-based tools in the tool group will be affected.
 */
export function setBrushSizeForToolGroup(
  toolGroupId: string,
  brushSize: number,
  toolName?: string
): void {
  const toolGroup = getToolGroup(toolGroupId);

  if (toolGroup === undefined) {
    return;
  }

  const brushBasedToolInstances = getBrushToolInstances(toolGroupId, toolName);

  brushBasedToolInstances.forEach((tool: BrushTool) => {
    const minRadius = tool.configuration.minRadius;
    const maxRadius = tool.configuration.maxRadius;

    let newBrushSize = minRadius ? Math.max(brushSize, minRadius) : brushSize;
    newBrushSize = maxRadius ? Math.min(newBrushSize, maxRadius) : newBrushSize;

    tool.configuration.brushSize = newBrushSize;

    // Invalidate the brush being rendered so it can update.
    tool.invalidateBrushCursor();
  });

  // Trigger an annotation render for any viewports on the toolgroup
  const viewportIds = toolGroup.getViewportIds();

  triggerAnnotationRenderForViewportIds(viewportIds);
}

/**
 * Gets the brush size for the first brush-based tool instance in a given tool group.
 * @param toolGroupId - The ID of the tool group to get the brush size for.
 * @param toolName - The name of the specific tool to get the brush size for (Optional)
 * If not provided, the first brush-based tool instance in the tool group will be used.
 * @returns The brush size of the selected tool instance, or undefined if no brush-based tool instance is found.
 */
export function getBrushSizeForToolGroup(
  toolGroupId: string,
  toolName?: string
): number {
  const toolGroup = getToolGroup(toolGroupId);

  if (toolGroup === undefined) {
    return;
  }

  const toolInstances = toolGroup._toolInstances;

  if (!Object.keys(toolInstances).length) {
    return;
  }

  const brushBasedToolInstances = getBrushToolInstances(toolGroupId, toolName);

  // one is enough as they share the same brush size
  const brushToolInstance = brushBasedToolInstances[0];

  if (!brushToolInstance) {
    return;
  }

  // TODO -> Assumes the brush sizes are the same and set via these helpers.
  return brushToolInstance.configuration.brushSize;
}
