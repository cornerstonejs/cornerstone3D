import { getToolGroup } from '../../store/ToolGroupManager';
import BrushTool from '../../tools/segmentation/BrushTool';
import triggerAnnotationRenderForViewportIds from '../triggerAnnotationRenderForViewportIds';
import { getRenderingEngine } from '@cornerstonejs/core';
import getBrushToolInstances from './utilities';

export function setBrushSizeForToolGroup(
  toolGroupId: string,
  brushSize: number
): void {
  const toolGroup = getToolGroup(toolGroupId);

  if (toolGroup === undefined) {
    return;
  }

  const brushBasedToolInstances = getBrushToolInstances(toolGroupId);

  brushBasedToolInstances.forEach((tool: BrushTool) => {
    tool.configuration.brushSize = brushSize;

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

  const { renderingEngineId } = viewportsInfoArray[0];

  // Use helper to get array of viewportIds, or we just end up doing this mapping
  // ourselves here.
  const viewportIds = toolGroup.getViewportIds();

  const renderingEngine = getRenderingEngine(renderingEngineId);

  triggerAnnotationRenderForViewportIds(renderingEngine, viewportIds);
}

export function getBrushSizeForToolGroup(toolGroupId: string): void {
  const toolGroup = getToolGroup(toolGroupId);

  if (toolGroup === undefined) {
    return;
  }

  const toolInstances = toolGroup._toolInstances;

  if (!Object.keys(toolInstances).length) {
    return;
  }

  const brushBasedToolInstances = getBrushToolInstances(toolGroupId);

  // one is enough as they share the same brush size
  const brushToolInstance = brushBasedToolInstances[0];

  if (!brushToolInstance) {
    return;
  }

  // TODO -> Assumes the brush sizes are the same and set via these helpers.
  return brushToolInstance.configuration.brushSize;
}
