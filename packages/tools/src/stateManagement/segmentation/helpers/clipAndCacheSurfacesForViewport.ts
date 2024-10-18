import type { Types } from '@cornerstonejs/core';
import {
  Enums,
  getWebWorkerManager,
  eventTarget,
  triggerEvent,
} from '@cornerstonejs/core';

import { WorkerTypes } from '../../../enums';
import { pointToString } from '../../../utilities/pointToString';
import { registerPolySegWorker } from '../polySeg/registerPolySegWorker';
import { getSurfaceActorEntry } from './getSegmentationActor';
const workerManager = getWebWorkerManager();

/**
 * Surfaces info for clipping
 */
export type SurfacesInfo = {
  id: string;
  points: number[];
  polys: number[];
  segmentIndex: number;
};

/**
 * The result of the surface clipping
 */
export type SurfaceClipResult = {
  points: number[];
  lines: number[];
  numberOfCells: number;
};

export type PolyDataClipCacheType = Map<string, Map<string, SurfaceClipResult>>;

/**
 * a cache from actorUID to cacheId to SurfaceClipResult
 * Map<actorUID, Map<cacheId, SurfaceClipResult>>
 * cacheId is slice specific (viewPlaneNormal, sliceIndex)
 */
const polyDataCache = new Map() as PolyDataClipCacheType;
const surfacesAABBCache = new Map();

const triggerWorkerProgress = (eventTarget, progress) => {
  triggerEvent(eventTarget, Enums.Events.WEB_WORKER_PROGRESS, {
    progress,
    type: WorkerTypes.SURFACE_CLIPPING,
  });
};

/**
 * Clips and caches surfaces for a specific viewport.
 *
 * @param surfacesInfo - An array of surfaces information.
 * @param viewport - The volume viewport.
 * @param segmentationId - The id of the segmentation.
 * @returns The cached polyData.
 */
export async function clipAndCacheSurfacesForViewport(
  surfacesInfo: SurfacesInfo[],
  viewport: Types.IVolumeViewport,
  segmentationId: string
) {
  registerPolySegWorker();
  // All planes is an array of planes pairs for each slice, so we should loop over them and
  // add the planes to the clipping filter and cache the results for that slice

  // Fix these ts ignores
  // @ts-ignore
  const planesInfo = viewport.getSlicesClippingPlanes?.();

  if (!planesInfo) {
    // this means it is probably the stack viewport not being ready
    // in terms of planes which we should wait for the first render to
    // get the planes
    return;
  }

  // @ts-ignore
  const currentSliceIndex = viewport.getSliceIndex();

  // Reorder planesInfo based on proximity to currentSliceIndex
  planesInfo.sort((a, b) => {
    const diffA = Math.abs(a.sliceIndex - currentSliceIndex);
    const diffB = Math.abs(b.sliceIndex - currentSliceIndex);
    return diffA - diffB;
  });

  triggerWorkerProgress(eventTarget, 0);

  // check which surfaces don't have a cached AABB
  // make a list of the surfaces that don't have a cached AABB
  await updateSurfacesAABBCache(surfacesInfo);

  const surfacesAABB = new Map();
  surfacesInfo.forEach((surface) => {
    surfacesAABB.set(surface.id, surfacesAABBCache.get(surface.id));
  });

  const camera = viewport.getCamera();

  await workerManager
    .executeTask(
      'polySeg',
      'cutSurfacesIntoPlanes',
      {
        surfacesInfo,
        planesInfo,
        surfacesAABB,
      },
      {
        callbacks: [
          // progress callback
          ({ progress }) => {
            triggerWorkerProgress(eventTarget, progress);
          },
          // update cache callback
          ({ sliceIndex, polyDataResults }) => {
            polyDataResults.forEach((polyDataResult) => {
              const actorEntry = getSurfaceActorEntry(
                viewport.id,
                segmentationId,
                polyDataResult.segmentIndex
              );
              const actorUID = actorEntry.uid;
              const cacheId = generateCacheId(
                viewport,
                camera.viewPlaneNormal,
                sliceIndex
              );
              updatePolyDataCache(actorUID, cacheId, polyDataResult);
            });
          },
        ],
      }
    )
    .catch((error) => {
      console.error(error);
    });

  triggerWorkerProgress(eventTarget, 100);

  return polyDataCache;
}

/**
 * Updates the surfaces AABB cache with the AABB information for the given surfaces.
 * If the AABB information for a surface already exists in the cache, it will not be updated.
 * @param surfacesInfo - An array of surfaces information.
 * @returns A Promise that resolves when the surfaces AABB cache has been updated.
 */
async function updateSurfacesAABBCache(surfacesInfo: SurfacesInfo[]) {
  const surfacesWithoutAABB = surfacesInfo.filter(
    (surface) => !surfacesAABBCache.has(surface.id)
  );

  if (!surfacesWithoutAABB.length) {
    return;
  }

  const surfacesAABB = await workerManager.executeTask(
    'polySeg',
    'getSurfacesAABBs',
    {
      surfacesInfo: surfacesWithoutAABB,
    },
    {
      callbacks: [
        // progress callback
        ({ progress }) => {
          triggerWorkerProgress(eventTarget, progress);
        },
      ],
    }
  );

  // update the surfacesAABBCache with the new surfacesAABB
  surfacesAABB.forEach((aabb, id) => {
    surfacesAABBCache.set(id, aabb);
  });
}

// Helper function to generate a cache ID
export function generateCacheId(viewport, viewPlaneNormal, sliceIndex) {
  return `${viewport.id}-${pointToString(viewPlaneNormal)}-${sliceIndex}`;
}

// Helper function to update PolyData cache
export function updatePolyDataCache(
  actorUID: string,
  cacheId: string,
  polyDataResult: SurfaceClipResult
) {
  const { points, lines, numberOfCells } = polyDataResult;

  let actorCache = polyDataCache.get(actorUID);
  if (!actorCache) {
    actorCache = new Map<string, SurfaceClipResult>();
    polyDataCache.set(actorUID, actorCache);
  }
  actorCache.set(cacheId, { points, lines, numberOfCells });
}
