import { getRenderingEngines } from '@cornerstonejs/core';
import { state } from '../index';
import { IToolGroup } from '../../types';

/**
 * Given a rendering engine Id and a viewport Id, return the tool group that
 * contains that rendering engine and viewport. Note: A viewport can only be
 * associated with a single tool group. You cannot have a viewport that belongs
 * to multiple tool groups. To achieve so, create a new viewport and a new toolGroup
 * for it. This will not impact memory usage much as the volume textures are
 * shared across all viewports rendering the same image.
 *
 * @param viewportId - The Id of the viewport that the tool is being
 * added to.
 * @param renderingEngineId - The Id of the rendering engine that the
 * tool group is associated with.
 * @returns A tool group.
 */
function getToolGroupForViewport(
  viewportId: string,
  renderingEngineId?: string
): IToolGroup | undefined {
  if (!renderingEngineId) {
    renderingEngineId = getRenderingEngines().find((re) =>
      re.getViewports().find((vp) => vp.id === viewportId)
    )?.id;
  }

  const toolGroupFilteredByIds = state.toolGroups.filter((tg) =>
    tg.viewportsInfo.some(
      (vp) =>
        vp.renderingEngineId === renderingEngineId &&
        (!vp.viewportId || vp.viewportId === viewportId)
    )
  );

  if (!toolGroupFilteredByIds.length) {
    return;
  }

  if (toolGroupFilteredByIds.length > 1) {
    throw new Error(
      `Multiple tool groups found for renderingEngineId: ${renderingEngineId} and viewportId: ${viewportId}. You should only
      have one tool group per viewport in a renderingEngine.`
    );
  }

  return toolGroupFilteredByIds[0];
}

export default getToolGroupForViewport;
