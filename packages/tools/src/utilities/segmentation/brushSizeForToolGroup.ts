import { getToolGroup } from '../../store/ToolGroupManager';
import BrushTool from '../../tools/segmentation/BrushTool';
import triggerAnnotationRenderForViewportIds from '../triggerAnnotationRenderForViewportIds';
import { getRenderingEngine } from '@cornerstonejs/core';

const brushToolName = BrushTool.toolName;

export function setBrushSizeForToolGroup(
  toolGroupId: string,
  brushSize: number
): void {
  const toolGroup = getToolGroup(toolGroupId);

  if (toolGroup === undefined) {
    return;
  }

  const toolInstances = toolGroup._toolInstances;

  if (!Object.keys(toolInstances).length) {
    return;
  }

  const brushToolInstance = toolInstances[brushToolName];

  if (!brushToolInstance) {
    return;
  }

  brushToolInstance.configuration.brushSize = brushSize;

  // Invalidate the brush being rendered so it can update.
  brushToolInstance.invalidateBrushCursor();

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

  const brushToolInstance = toolInstances[brushToolName];

  if (!brushToolInstance) {
    return;
  }

  // TODO -> Assumes the brush sizes are the same and set via these helpers.

  // const toolInstanceNames = Object.keys(brushToolInstances);
  // const firstToolInstance = brushToolInstances[toolInstanceNames[0]];

  return brushToolInstance.configuration.brushSize;
}
