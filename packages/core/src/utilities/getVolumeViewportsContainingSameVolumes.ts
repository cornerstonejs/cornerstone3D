import { IVolumeViewport } from '../types';
import {
  getRenderingEngines,
  getRenderingEngine,
} from '../RenderingEngine/getRenderingEngine';

/**
 * Returns the viewports containing the same volume actors (all actors) the same
 * as the target viewport. If renderingEngineId is provided, it will only return
 * viewports that are associated with the renderingEngineId; otherwise, it will
 * return search in all rendering engines.
 *
 * This method is useful for finding viewports that are associated with the same
 * volume (e.g., for tools that share state between viewports).
 *
 * @param viewport - target viewport
 * @returns array of viewports that have the same volume actor as the target viewport
 */
function getVolumeViewportsContainingSameVolumes(
  targetViewport: IVolumeViewport,
  renderingEngineId?: string
): Array<IVolumeViewport> {
  // If rendering engine is not provided, use all rendering engines
  let renderingEngines;
  if (renderingEngineId) {
    renderingEngines = [getRenderingEngine(renderingEngineId)];
  } else {
    renderingEngines = getRenderingEngines();
  }

  const sameVolumesViewports = [];

  renderingEngines.forEach((renderingEngine) => {
    const targetActors = targetViewport.getActors();
    const viewports = renderingEngine.getVolumeViewports();

    for (const vp of viewports) {
      const vpActors = vp.getActors();

      if (vpActors.length !== targetActors.length) {
        continue;
      }

      // every targetActors should be in the vpActors
      const sameVolumes = targetActors.every(({ uid }) =>
        vpActors.find((vpActor) => uid === vpActor.uid)
      );

      if (sameVolumes) {
        sameVolumesViewports.push(vp);
      }
    }
  });

  return sameVolumesViewports;
}

export default getVolumeViewportsContainingSameVolumes;
