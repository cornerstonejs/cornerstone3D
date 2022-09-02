import { getRenderingEngines, utilities } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

//import type { Types } from '@cornerstonejs/core'

type RenderingEngineAndViewportIds = {
  renderingEngine: Types.IRenderingEngine | undefined; //Types.IRenderingEngine | undefined
  viewportIds: Array<string>;
};

/**
 * Given a volumeId, it finds the viewports and renderingEngines that
 * include that volume, and triggers a render if renderingEngine is available.
 *
 * @param volumeId - The Id of the volume
 */
const autoLoad = (volumeId: string): void => {
  const renderingEngineAndViewportIds =
    getRenderingEngineAndViewportsContainingVolume(volumeId);

  if (!renderingEngineAndViewportIds || !renderingEngineAndViewportIds.length) {
    return;
  }

  renderingEngineAndViewportIds.forEach(({ renderingEngine, viewportIds }) => {
    if (!renderingEngine.hasBeenDestroyed) {
      renderingEngine.renderViewports(viewportIds);
    }
  });
};

function getRenderingEngineAndViewportsContainingVolume(
  volumeId: string
): Array<RenderingEngineAndViewportIds> {
  const renderingEnginesArray = getRenderingEngines();

  const renderingEngineAndViewportIds = [];

  for (let i = 0; i < renderingEnginesArray.length; i++) {
    const renderingEngine = renderingEnginesArray[i];
    const viewports = utilities.getViewportsWithVolumeId(
      volumeId,
      renderingEngine.id
    );

    if (viewports.length) {
      renderingEngineAndViewportIds.push({
        renderingEngine,
        viewportIds: viewports.map((viewport) => viewport.id),
      });
    }
  }

  return renderingEngineAndViewportIds;
}

export default autoLoad;
