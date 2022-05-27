import { IVolumeViewport } from '../types';
import {
  getRenderingEngines,
  getRenderingEngine,
} from '../RenderingEngine/getRenderingEngine';

/**
 * Similar to {@link getVolumeViewportsContainingSameVolumes}, but uses the volumeId
 * to filter viewports that contain the same volume.
 *
 * @returns VolumeViewport viewports array
 */
function getVolumeViewportsContainingVolumeId(
  volumeId: string,
  renderingEngineId?: string
): Array<IVolumeViewport> {
  // If rendering engine is not provided, use all rendering engines
  let renderingEngines;
  if (renderingEngineId) {
    renderingEngines = [getRenderingEngine(renderingEngineId)];
  } else {
    renderingEngines = getRenderingEngines();
  }

  const sameVolumeViewports = [];

  renderingEngines.forEach((renderingEngine) => {
    const viewports = renderingEngine.getVolumeViewports();
    const filteredViewports = viewports.filter((vp) => {
      const actorEntries = vp.getActors();
      return actorEntries.some(
        (actorEntry) => actorEntry.actor && actorEntry.uid === volumeId
      );
    });
    sameVolumeViewports.push(...filteredViewports);
  });

  return sameVolumeViewports;
}

export default getVolumeViewportsContainingVolumeId;
