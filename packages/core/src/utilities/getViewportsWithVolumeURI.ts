import type { IVolumeViewport } from '../types';
import {
  getRenderingEngines,
  getRenderingEngine,
} from '../RenderingEngine/getRenderingEngine';

/**
 * Retrieves viewports containing a specific volume ID.
 *
 * @param volumeId - The ID of the volume to search for within viewports.
 * @param renderingEngineId - (Optional) The ID of a specific rendering engine to search in.
 * @returns An array of volume viewports that contain the specified volume ID.
 */
function getViewportsWithVolumeURI(
  volumeURI: string,
  renderingEngineId?: string
): IVolumeViewport[] {
  // If rendering engine is not provided, use all rendering engines
  const renderingEngines = renderingEngineId
    ? [getRenderingEngine(renderingEngineId)]
    : getRenderingEngines();

  const targetViewports: IVolumeViewport[] = [];

  renderingEngines.forEach((renderingEngine) => {
    const viewports = renderingEngine.getVolumeViewports();
    const filteredViewports = viewports.filter((vp) =>
      vp.hasVolumeURI(volumeURI)
    );
    targetViewports.push(...filteredViewports);
  });

  return targetViewports;
}

export default getViewportsWithVolumeURI;
