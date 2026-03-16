import { getRenderingEngines } from '../RenderingEngine/getRenderingEngine';
import {
  viewportSupportsVolumeId,
  type VolumeIdViewport,
} from './viewportCapabilities';

/**
 * Retrieves viewports containing a specific volume ID.
 *
 * @param volumeId - The ID of the volume to search for within viewports.
 * @returns An array of volume viewports that contain the specified volume ID.
 */
function getViewportsWithVolumeId(volumeId: string): VolumeIdViewport[] {
  // If rendering engine is not provided, use all rendering engines
  const renderingEngines = getRenderingEngines();

  const targetViewports: VolumeIdViewport[] = [];

  renderingEngines.forEach((renderingEngine) => {
    const viewports = renderingEngine
      .getViewports()
      .filter(viewportSupportsVolumeId);
    const filteredViewports = viewports.filter((vp) =>
      vp.hasVolumeId(volumeId)
    );
    targetViewports.push(...filteredViewports);
  });

  return targetViewports;
}

export default getViewportsWithVolumeId;
