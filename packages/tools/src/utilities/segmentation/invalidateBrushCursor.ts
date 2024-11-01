import { getToolGroup } from '../../store/ToolGroupManager';
import type BrushTool from '../../tools/segmentation/BrushTool';
import triggerAnnotationRenderForViewportIds from '../triggerAnnotationRenderForViewportIds';
import { getBrushToolInstances } from './getBrushToolInstances';

/**
 * Invalidates the brush cursor for a specific tool group.
 * This function triggers the update of the brush being rendered.
 * It also triggers an annotation render for any viewports on the tool group.
 *
 * @param toolGroupId - The ID of the tool group.
 */
export function invalidateBrushCursor(toolGroupId: string): void {
  const toolGroup = getToolGroup(toolGroupId);

  if (toolGroup === undefined) {
    return;
  }

  const brushBasedToolInstances = getBrushToolInstances(toolGroupId);

  brushBasedToolInstances.forEach((tool: BrushTool) => {
    // Invalidate the brush being rendered so it can update.
    tool.invalidateBrushCursor();
  });

  // Trigger an annotation render for any viewports on the toolgroup
  const viewportsInfo = toolGroup.getViewportsInfo();

  const viewportsInfoArray = Object.keys(viewportsInfo).map(
    (key) => viewportsInfo[key]
  );

  if (!viewportsInfoArray.length) {
    return;
  }

  // Use helper to get array of viewportIds, or we just end up doing this mapping
  // ourselves here.
  const viewportIds = toolGroup.getViewportIds();

  triggerAnnotationRenderForViewportIds(viewportIds);
}
