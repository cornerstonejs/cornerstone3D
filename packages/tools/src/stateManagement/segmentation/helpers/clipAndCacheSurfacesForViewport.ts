import {
  Types,
  Enums,
  getWebWorkerManager,
  eventTarget,
  triggerEvent,
  utilities,
} from '@cornerstonejs/core';

import { WorkerTypes } from '../../../enums';
import { pointToString } from '../../../utilities';
import { registerPolySegWorker } from '../polySeg/registerPolySegWorker';
const workerManager = getWebWorkerManager();

const polyDataCache = new Map();
const currentViewportNormal = new Map();
const surfacesAABBCache = new Map();

type SurfacesInfo = {
  id: string;
  points: number[];
  polys: number[];
  segmentIndex: number;
};

const triggerWorkerProgress = (eventTarget, progress) => {
  triggerEvent(eventTarget, Enums.Events.WEB_WORKER_PROGRESS, {
    progress,
    type: WorkerTypes.DISPLAY_TOOL_CLIP_SURFACE,
  });
};

export async function clipAndCacheSurfacesForViewport(
  surfacesInfo: SurfacesInfo[],
  viewport: Types.IVolumeViewport,
  segmentationRepresentationUID: string
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

  const camera = viewport.getCamera();

  function cameraModifiedCallback(evt: Types.EventTypes.CameraModifiedEvent) {
    const { camera } = evt.detail;
    const { viewPlaneNormal } = camera;

    // Note: I think choosing one of the surfaces to see
    // if the viewPlaneNormal is the same for all surfaces is ok enough
    // to decide if we should recompute the clipping planes
    const surface1 = surfacesInfo[0];

    if (
      utilities.isEqual(viewPlaneNormal, currentViewportNormal.get(surface1.id))
    ) {
      return;
    }

    currentViewportNormal.set(surface1.id, viewPlaneNormal);

    workerManager.terminate('displayTools');

    setTimeout(() => {
      clipAndCacheSurfacesForViewport(
        surfacesInfo,
        viewport,
        segmentationRepresentationUID
      );
    }, 0);

    viewport.render();
  }

  // Remove the existing event listener
  viewport.element.removeEventListener(
    Enums.Events.CAMERA_MODIFIED,
    cameraModifiedCallback as EventListener
  );

  // Add the event listener
  viewport.element.addEventListener(
    Enums.Events.CAMERA_MODIFIED,
    cameraModifiedCallback as EventListener
  );

  triggerWorkerProgress(eventTarget, 0);

  // check which surfaces don't have a cached AABB
  // make a list of the surfaces that don't have a cached AABB
  await updateSurfacesAABBCache(surfacesInfo);

  const surfacesAABB = new Map();
  surfacesInfo.forEach((surface) => {
    surfacesAABB.set(surface.id, surfacesAABBCache.get(surface.id));
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
            polyDataResults.forEach((polyDataResult, surfaceId) => {
              const actorUID = `${segmentationRepresentationUID}_${surfaceId}`;
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

export function getSurfaceActorUID(
  segmentationRepresentationUID: string,
  surfaceId: string
) {
  return `${segmentationRepresentationUID}_${surfaceId}`;
}

// Helper function to generate a cache ID
export function generateCacheId(viewport, viewPlaneNormal, sliceIndex) {
  return `${viewport.id}-${pointToString(viewPlaneNormal)}-${sliceIndex}`;
}

// Helper function to get or create PolyData
export function getOrCreatePolyData(actorEntry) {
  let actorCache = polyDataCache.get(actorEntry.uid);
  if (!actorCache) {
    actorCache = new Map();
    polyDataCache.set(actorEntry.uid, actorCache);
  }

  throw new Error('Not implemented');
}

// Helper function to update PolyData cache
export function updatePolyDataCache(actorUID, cacheId, polyDataResult) {
  const { points, lines, numberOfCells } = polyDataResult;

  let actorCache = polyDataCache.get(actorUID);
  if (!actorCache) {
    actorCache = new Map();
    polyDataCache.set(actorUID, actorCache);
  }
  actorCache.set(cacheId, { points, lines, numberOfCells });
}

// Helper function to get and sort planes info based on slice index
export function getSortedPlanesInfo(viewport) {
  const planesInfo = viewport.getSlicesClippingPlanes?.();
  const currentSliceIndex = viewport.getSliceIndex();

  // Sort planesInfo based on proximity to currentSliceIndex
  planesInfo.sort((a, b) => {
    const diffA = Math.abs(a.sliceIndex - currentSliceIndex);
    const diffB = Math.abs(b.sliceIndex - currentSliceIndex);
    return diffA - diffB;
  });
  return planesInfo;
}
