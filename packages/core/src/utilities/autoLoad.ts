import { getRenderingEngines } from '../RenderingEngine/getRenderingEngine';
import type { IRenderingEngine } from '../types';
import getViewportsWithVolumeId from './getViewportsWithVolumeId';

type RenderingEngineAndViewportIds = {
  renderingEngine: IRenderingEngine | undefined;
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

  if (!renderingEngineAndViewportIds?.length) {
    return;
  }

  renderingEngineAndViewportIds.forEach(({ renderingEngine, viewportIds }) => {
    if (!renderingEngine.hasBeenDestroyed) {
      renderingEngine.renderViewports(viewportIds);
    }
  });
};

/**
 * Retrieves rendering engines and their viewports that contain the specified volume.
 *
 * @param volumeId - The ID of the volume to search for.
 * @returns An array of objects, each containing a rendering engine and the IDs of its viewports that contain the volume.
 */
function getRenderingEngineAndViewportsContainingVolume(
  volumeId: string
): Array<RenderingEngineAndViewportIds> {
  const renderingEnginesArray = getRenderingEngines();
  const renderingEngineAndViewportIds: Array<RenderingEngineAndViewportIds> =
    [];

  renderingEnginesArray.forEach((renderingEngine) => {
    const viewports = getViewportsWithVolumeId(volumeId);

    if (viewports.length) {
      renderingEngineAndViewportIds.push({
        renderingEngine,
        viewportIds: viewports.map((viewport) => viewport.id),
      });
    }
  });

  return renderingEngineAndViewportIds;
}

export default autoLoad;
