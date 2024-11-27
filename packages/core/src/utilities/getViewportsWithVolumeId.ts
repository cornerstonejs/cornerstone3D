import type { IVolumeViewport } from '../types';
import { getRenderingEngines } from '../RenderingEngine/getRenderingEngine';

/**
 * Retrieves viewports containing a specific volume ID.
 *
 * @param volumeId - The ID of the volume to search for within viewports.
 * @returns An array of volume viewports that contain the specified volume ID.
 */
function getViewportsWithVolumeId(volumeId: string): IVolumeViewport[] {
  // If rendering engine is not provided, use all rendering engines
  const renderingEngines = getRenderingEngines();

  const targetViewports: IVolumeViewport[] = [];

  renderingEngines.forEach((renderingEngine) => {
    const viewports = renderingEngine.getVolumeViewports();
    const filteredViewports = viewports.filter((vp) =>
      vp.hasVolumeId(volumeId)
    );
    targetViewports.push(...filteredViewports);
  });

  return targetViewports;
}

export default getViewportsWithVolumeId;
