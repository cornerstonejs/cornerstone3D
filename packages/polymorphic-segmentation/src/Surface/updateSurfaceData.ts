import type { Types } from '@cornerstonejs/core';
import {
  cache,
  getEnabledElementByViewportId,
  utilities,
} from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';

import { computeSurfaceFromLabelmapSegmentation } from './surfaceComputationStrategies';
import { createAndCacheSurfacesFromRaw } from './createAndCacheSurfacesFromRaw';

const {
  utilities: {
    segmentation: { getUniqueSegmentIndices },
  },
  segmentation: {
    state: {
      getViewportIdsWithSegmentation,
      getSegmentation,
      getSegmentationRepresentation,
    },
    triggerSegmentationEvents: { triggerSegmentationModified },
  },
  Enums: { SegmentationRepresentations },
} = cornerstoneTools;

const cs3dLogger = utilities.logger.polySegLog.getLogger(
  'Surface.updateSurfaceData'
);

const updates = new Map<string, { promise: Promise<void>; rerun: boolean }>();

/**
 * Updates the surfaces of a segmentation from its labelmap.
 *
 * Only one update runs for a segmentation at a time. A call while an update
 * runs does not start a second conversion: it asks the running update for one
 * more pass, which reads the latest labelmap, and it gets the promise of that
 * update. So conversions do not pile up during a paint, and an older result
 * never replaces a newer one.
 */
export function updateSurfaceData(segmentationId: string): Promise<void> {
  const running = updates.get(segmentationId);
  if (running) {
    running.rerun = true;
    return running.promise;
  }

  const update = { promise: undefined as Promise<void>, rerun: false };
  update.promise = (async () => {
    try {
      do {
        update.rerun = false;
        try {
          await updateSurfaceDataOnce(segmentationId);
        } catch (error) {
          // A newer labelmap is waiting, so its pass replaces this failed one.
          if (!update.rerun) {
            throw error;
          }
          cs3dLogger.warn(error);
        }
      } while (update.rerun);
    } finally {
      updates.delete(segmentationId);
    }
  })();
  updates.set(segmentationId, update);
  return update.promise;
}

async function updateSurfaceDataOnce(segmentationId: string) {
  const surfacesObj =
    await computeSurfaceFromLabelmapSegmentation(segmentationId);

  if (!surfacesObj) {
    return;
  }

  const segmentation = getSegmentation(segmentationId);
  const indices = getUniqueSegmentIndices(segmentationId);

  if (!indices.length) {
    // means all segments were removed so we need to empty out
    // the geometry data
    const geometryIds = segmentation.representationData.Surface.geometryIds;
    geometryIds.forEach((geometryId) => {
      const geometry = cache.getGeometry(geometryId);
      const surface = geometry.data as Types.ISurface;
      surface.points = [];
      surface.polys = [];
    });

    triggerSegmentationModified(segmentationId);

    return;
  }

  const viewportIds = getViewportIdsWithSegmentation(segmentationId);

  // if new surfaceObj does not have the same segment indices as the previous one,
  // and some were deleted, we need to remove the geometries for the deleted segments
  viewportIds.forEach((viewportId) => {
    const enabledElement = getEnabledElementByViewportId(viewportId);
    const viewport = enabledElement.viewport;
    if (viewport.type !== 'volume3d') {
      return;
    }

    const actorEntries = (viewport as Types.IVolumeViewport).getActors();

    const segmentIndicesAsSurface = actorEntries
      .map((actor) => (actor.representationUID as string)?.split('-').pop())
      .filter((segment) => segment && Number(segment))
      .map(Number);

    segmentIndicesAsSurface.forEach((segmentIndex) => {
      if (!indices.includes(segmentIndex)) {
        const filteredSurfaceActors = actorEntries.filter(
          (actor) =>
            actor.representationUID &&
            actor.representationUID ===
              `${segmentationId}-${SegmentationRepresentations.Surface}-${segmentIndex}`
        );

        const removingUIDs = filteredSurfaceActors.map((actor) => actor.uid);
        viewport.removeActors(removingUIDs);
        viewport.render();

        // remove the geometry from the cache
        const geometryId = `segmentation_${segmentationId}_surface_${segmentIndex}`;
        cache.removeGeometryLoadObject(geometryId);
      }
    });
  });

  const promises = surfacesObj.map(({ data, segmentIndex }) => {
    const geometryId = `segmentation_${segmentationId}_surface_${segmentIndex}`;

    const geometry = cache.getGeometry(geometryId) as Types.IGeometry;

    if (!geometry) {
      // means it is a new segment getting added while we were
      // listening to the segmentation data modified event

      return viewportIds.map((viewportId) => {
        const surfaceRepresentation = getSegmentationRepresentation(
          viewportId,
          {
            segmentationId,
            type: SegmentationRepresentations.Surface,
          }
        );

        if (!surfaceRepresentation) {
          return;
        }

        return [surfaceRepresentation].map((surfaceRepresentation) => {
          segmentation.representationData.Surface.geometryIds.set(
            segmentIndex,
            geometryId
          );

          const enabledElement = getEnabledElementByViewportId(viewportId);

          return createAndCacheSurfacesFromRaw(
            segmentationId,
            [{ segmentIndex, data }],
            {
              segmentationId: surfaceRepresentation.segmentationId,
              viewport: enabledElement.viewport,
            }
          );
        });
      });
    } else if (indices.includes(segmentIndex)) {
      // if the geometry already exists and the segmentIndex is
      // still present, update the geometry data
      const surface = geometry.data as Types.ISurface;
      surface.points = data.points;
      surface.polys = data.polys;
    } else {
      const surface = geometry.data as Types.ISurface;
      surface.points = [];
      surface.polys = [];
    }
  });

  await Promise.all(promises);

  triggerSegmentationModified(segmentationId);
}
