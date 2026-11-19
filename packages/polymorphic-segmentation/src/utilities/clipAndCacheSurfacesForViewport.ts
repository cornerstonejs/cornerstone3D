import type { Types } from '@cornerstonejs/core';
import {
  Enums,
  getWebWorkerManager,
  eventTarget,
  triggerEvent,
} from '@cornerstonejs/core';

import { Enums as ToolsEnums, utilities } from '@cornerstonejs/tools';
import { registerPolySegWorker } from '../registerPolySegWorker';
import { utilities as cornerstoneUtilities } from '@cornerstonejs/core';

const cs3dLogger = cornerstoneUtilities.logger.polySegLog.getLogger(
  'utilities.clipAndCacheSurfacesForViewport'
);

const workerManager = getWebWorkerManager();

const { WorkerTypes } = ToolsEnums;
const { pointToString } = utilities;

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

export type PolyDataClipCacheType = Map<number, Map<string, SurfaceClipResult>>;

/**
 * The contours cut from surfaces, by the id of the viewport, then by the id of
 * the surface (one segment of one segmentation), then by the slice
 * (`generateCacheId`): an entry is unique for its viewport, its surface and
 * its slice. A cut of a surface for a viewport replaces the entries of that
 * surface for that viewport.
 */
const polyDataCache = new Map<
  string,
  Map<string, Map<string, SurfaceClipResult>>
>();

/**
 * The bounding box of a surface by the array of its points, the one input of
 * the box. A surface whose points are another array, as after an update of
 * the surface, gets a new box. The key is weak: the cache keeps no array of a
 * surface that is gone.
 */
const surfacesAABBCache = new WeakMap<number[], unknown>();

const triggerWorkerProgress = (eventTarget, progress) => {
  triggerEvent(eventTarget, Enums.Events.WEB_WORKER_PROGRESS, {
    progress,
    type: WorkerTypes.SURFACE_CLIPPING,
  });
};

/**
 * The clipping planes of each slice of a viewport, by
 * `utilities.getSlicesClippingPlanes` of the core: for a viewport that shows
 * a volume, and for a next viewport that shows a stack, where each image is
 * a slice.
 */
function getSlicesClippingPlanes(viewport: Types.IViewport) {
  return cornerstoneUtilities.getSlicesClippingPlanes(viewport);
}

/**
 * Clips and caches surfaces for a specific viewport.
 *
 * @param surfacesInfo - An array of surfaces information. The id of each
 * surface must name that surface (its geometry id): the bounding box and the
 * contours are kept by it.
 * @param viewport - The volume viewport.
 * @returns The contours of these surfaces on this viewport, by segment index
 * and then by slice. Contours that other viewports or other surfaces got
 * before are not in it.
 */
export async function clipAndCacheSurfacesForViewport(
  surfacesInfo: SurfacesInfo[],
  viewport: Types.IViewport
) {
  registerPolySegWorker();
  // All planes is an array of planes pairs for each slice, so we should loop over them and
  // add the planes to the clipping filter and cache the results for that slice

  const planesInfo = getSlicesClippingPlanes(viewport);

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
    surfacesAABB.set(surface.id, surfacesAABBCache.get(surface.points));
  });

  const { viewPlaneNormal } = viewport.getViewReference();
  const viewportCache =
    polyDataCache.get(viewport.id) ??
    new Map<string, Map<string, SurfaceClipResult>>();
  const contoursBySegmentIndex = new Map() as PolyDataClipCacheType;

  polyDataCache.set(viewport.id, viewportCache);
  surfacesInfo.forEach(({ id, segmentIndex }) => {
    const surfaceCache = new Map<string, SurfaceClipResult>();

    viewportCache.set(id, surfaceCache);
    contoursBySegmentIndex.set(Number(segmentIndex), surfaceCache);
  });

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
            polyDataResults.forEach((polyDataResult, segmentIndex) => {
              const surfaceCache = contoursBySegmentIndex.get(
                Number(segmentIndex)
              );

              if (!surfaceCache) {
                return;
              }

              const cacheId = generateCacheId(
                viewport,
                viewPlaneNormal,
                sliceIndex
              );
              updatePolyDataCache(surfaceCache, cacheId, polyDataResult);
            });
          },
        ],
      }
    )
    .catch((error) => {
      cs3dLogger.error(error);
    });

  triggerWorkerProgress(eventTarget, 100);

  return contoursBySegmentIndex;
}

/**
 * Updates the surfaces AABB cache with the AABB information for the given surfaces.
 * The AABB of a surface is kept while the surface keeps its points, and
 * computed again when they change.
 * @param surfacesInfo - An array of surfaces information.
 * @returns A Promise that resolves when the surfaces AABB cache has been updated.
 */
async function updateSurfacesAABBCache(surfacesInfo: SurfacesInfo[]) {
  const surfacesWithoutAABB = surfacesInfo.filter(
    (surface) => !surfacesAABBCache.has(surface.points)
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
    const surface = surfacesWithoutAABB.find(
      (candidate) => candidate.id === id
    );

    if (surface) {
      surfacesAABBCache.set(surface.points, aabb);
    }
  });
}

// Helper function to generate a cache ID
export function generateCacheId(viewport, viewPlaneNormal, sliceIndex) {
  return `${viewport.id}-${pointToString(viewPlaneNormal)}-${sliceIndex}`;
}

/**
 * Puts the contour of one slice into the cache of one surface on one viewport.
 */
export function updatePolyDataCache(
  surfaceCache: Map<string, SurfaceClipResult>,
  cacheId: string,
  polyDataResult: SurfaceClipResult
) {
  const { points, lines, numberOfCells } = polyDataResult;

  surfaceCache.set(cacheId, { points, lines, numberOfCells });
}
