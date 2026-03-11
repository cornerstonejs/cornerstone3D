import type { IViewport } from '../types';
import { getRenderingEngines } from '../RenderingEngine/getRenderingEngine';

type ViewportWithVolumeId = IViewport & {
  hasVolumeId(volumeId: string): boolean;
};

/**
 * Retrieves viewports containing a specific volume ID.
 *
 * @param volumeId - The ID of the volume to search for within viewports.
 * @returns An array of volume viewports that contain the specified volume ID.
 */
function getViewportsWithVolumeId(volumeId: string): ViewportWithVolumeId[] {
  // If rendering engine is not provided, use all rendering engines
  const renderingEngines = getRenderingEngines();

  const targetViewports: ViewportWithVolumeId[] = [];

  renderingEngines.forEach((renderingEngine) => {
    const viewports = renderingEngine.getViewports() as ViewportWithVolumeId[];
    const filteredViewports = viewports.filter(
      (vp) => typeof vp.hasVolumeId === 'function' && vp.hasVolumeId(volumeId)
    );
    targetViewports.push(...filteredViewports);
  });

  return targetViewports;
}

export default getViewportsWithVolumeId;
