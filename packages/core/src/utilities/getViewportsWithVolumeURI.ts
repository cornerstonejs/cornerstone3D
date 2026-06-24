import {
  getRenderingEngines,
  getRenderingEngine,
} from '../RenderingEngine/getRenderingEngine';
import {
  viewportSupportsVolumeURI,
  type VolumeURIViewport,
} from './viewportCapabilities';

/**
 * Retrieves viewports containing a specific volume URI.
 *
 * @param volumeURI - The volume URI to search for within viewports.
 * @param renderingEngineId - (Optional) The ID of a specific rendering engine to search in.
 * @returns Viewports that implement volume URI queries and contain the specified volume URI.
 */
function getViewportsWithVolumeURI(
  volumeURI: string,
  renderingEngineId?: string
): VolumeURIViewport[] {
  // If rendering engine is not provided, use all rendering engines
  const renderingEngines = renderingEngineId
    ? [getRenderingEngine(renderingEngineId)]
    : getRenderingEngines();

  const targetViewports: VolumeURIViewport[] = [];

  renderingEngines.forEach((renderingEngine) => {
    const viewports = renderingEngine
      .getViewports()
      .filter(viewportSupportsVolumeURI);
    const filteredViewports = viewports.filter((vp) =>
      vp.hasVolumeURI(volumeURI)
    );
    targetViewports.push(...filteredViewports);
  });

  return targetViewports;
}

export default getViewportsWithVolumeURI;
