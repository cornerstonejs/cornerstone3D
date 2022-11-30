import type { Types } from '@cornerstonejs/core';
import { getToolGroup } from '../../store/ToolGroupManager';
import BrushTool from '../../tools/segmentation/BrushTool';
import triggerAnnotationRenderForViewportIds from '../triggerAnnotationRenderForViewportIds';
import { getRenderingEngine } from '@cornerstonejs/core';

const brushToolName = BrushTool.toolName;

export function setBrushThresholdForToolGroup(
  toolGroupId: string,
  threshold: Types.Point2
) {
  const toolGroup = getToolGroup(toolGroupId);

  if (toolGroup === undefined) {
    return;
  }

  const toolInstances = toolGroup._toolInstances;

  if (!Object.keys(toolInstances).length) {
    return;
  }

  const brushToolInstances = toolInstances[brushToolName];

  if (!Object.keys(brushToolInstances).length) {
    return;
  }

  Object.keys(brushToolInstances).forEach((toolInstanceName) => {
    const tool = brushToolInstances[toolInstanceName];

    tool.configuration.strategySpecificConfiguration.THRESHOLD_INSIDE_CIRCLE.threshold =
      threshold;
  });

  // Trigger an annotation render for any viewports on the toolgroup
  const viewportsInfo = toolGroup.getViewportsInfo();

  if (!viewportsInfo.length) {
    return;
  }

  const { renderingEngineId } = viewportsInfo[0];

  // Use helper to get array of viewportIds, or we just end up doing this mapping
  // ourselves here.
  const viewportIds = toolGroup.getViewportIds();

  const renderingEngine = getRenderingEngine(renderingEngineId);

  triggerAnnotationRenderForViewportIds(renderingEngine, viewportIds);
}

export function getBrushThresholdForToolGroup(toolGroupId: string) {
  const toolGroup = getToolGroup(toolGroupId);

  if (toolGroup === undefined) {
    return;
  }

  const toolInstances = toolGroup._toolInstances;

  if (!Object.keys(toolInstances).length) {
    return;
  }

  const brushToolInstances = toolInstances[brushToolName];

  if (!Object.keys(brushToolInstances).length) {
    return;
  }

  // Note: -> Assumes the thresholds are the same and set via these helpers.
  const toolInstanceNames = Object.keys(brushToolInstances);
  const firstToolInstance = brushToolInstances[toolInstanceNames[0]];

  return firstToolInstance.configuration.strategySpecificConfiguration
    .THRESHOLD_INSIDE_CIRCLE.threshold;
}
