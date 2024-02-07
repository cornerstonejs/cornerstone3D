import { getRenderingEngine, type Types } from '@cornerstonejs/core';
import triggerAnnotationRender from './triggerAnnotationRender';
import { getToolGroup } from '../store/ToolGroupManager';

/**
 * Triggers annotation rendering for the specified tool group IDs.
 *
 * @param toolGroupIds - An array of tool group IDs.
 */
export function triggerAnnotationRenderForToolGroupIds(
  toolGroupIds: string[]
): void {
  toolGroupIds.forEach((toolGroupId) => {
    const toolGroup = getToolGroup(toolGroupId);

    if (!toolGroup) {
      console.warn(`ToolGroup not available for ${toolGroupId}`);
      return;
    }

    const viewportsInfo = toolGroup.getViewportsInfo();

    viewportsInfo.forEach((viewportInfo) => {
      const { renderingEngineId, viewportId } = viewportInfo;

      const renderingEngine = getRenderingEngine(renderingEngineId);
      if (!renderingEngine) {
        console.warn(`RenderingEngine not available for ${renderingEngineId}`);
        return;
      }

      const viewport = renderingEngine.getViewport(viewportId);
      triggerAnnotationRender(viewport.element);
    });
  });
}

export default triggerAnnotationRenderForToolGroupIds;
