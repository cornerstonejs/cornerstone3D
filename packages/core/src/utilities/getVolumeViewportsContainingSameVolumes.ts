import {
  getRenderingEngines,
  getRenderingEngine,
} from '../RenderingEngine/getRenderingEngine';
import {
  viewportSupportsVolumeActors,
  type VolumeActorViewport,
} from './viewportCapabilities';
import type { ActorEntry } from '../types';

/**
 * The data that an actor entry shows: its referenced id (the volume id of a
 * volume), else its uid. A planar viewport gives each mounted actor a uid of
 * its own, so two viewports of one volume share the referenced id only.
 */
function shownDataOf({ referencedId, uid }: ActorEntry): string {
  return referencedId ?? uid;
}

/**
 * The data that the actors of a viewport show, sorted, each as often as an
 * actor shows it: two lists are equal when the viewports show the same data
 * the same number of times.
 */
function sortedShownData(actors: ActorEntry[]): string[] {
  return actors.map(shownDataOf).sort();
}

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
  targetViewport: VolumeActorViewport,
  renderingEngineId?: string
): VolumeActorViewport[] {
  // If rendering engine is not provided, use all rendering engines
  let renderingEngines;
  if (renderingEngineId) {
    renderingEngines = [getRenderingEngine(renderingEngineId)];
  } else {
    renderingEngines = getRenderingEngines();
  }

  const sameVolumesViewports: VolumeActorViewport[] = [];

  renderingEngines.forEach((renderingEngine) => {
    const targetData = sortedShownData(targetViewport.getActors());
    const viewports = renderingEngine
      .getViewports()
      .filter(viewportSupportsVolumeActors);

    for (const vp of viewports) {
      const vpData = sortedShownData(vp.getActors());
      const sameVolumes =
        vpData.length === targetData.length &&
        vpData.every((data, index) => data === targetData[index]);

      if (sameVolumes) {
        sameVolumesViewports.push(vp);
      }
    }
  });

  return sameVolumesViewports;
}

export default getVolumeViewportsContainingSameVolumes;
