import type { Types, VolumeViewport3D } from '@cornerstonejs/core';
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

/**
 * Takes the surfaces of these actor entries off a 3D viewport. A next 3D
 * viewport shows each surface as a geometry display set under the id of its
 * geometry, which the actor entry names as its `referencedId`, and removes
 * that with its registration.
 */
function removeSurfaceActors(
  viewport: Types.IViewport,
  actorEntries: Types.ActorEntry[]
): void {
  actorEntries.forEach(({ referencedId }) => {
    utilities.genericViewportDisplaySetMetadataProvider.remove(referencedId);
    (viewport as unknown as Types.IViewport).removeData(referencedId);
  });
}

/**
 * Takes the segments that the labelmap no longer has out of the geometry map
 * of the Surface representation, and their geometries out of the cache. A
 * planar viewport then drops their props at its next render of the
 * representation, which draws only the segments of the map.
 *
 * @param geometryIds - The geometry map of the Surface representation.
 * @param segmentIndices - The segment indices of the labelmap.
 */
function removeGeometriesOfRemovedSegments(
  geometryIds: Map<number, string> | undefined,
  segmentIndices: number[]
): void {
  geometryIds?.forEach((geometryId, segmentIndex) => {
    if (segmentIndices.includes(segmentIndex)) {
      return;
    }

    geometryIds.delete(segmentIndex);
    if (cache.getGeometry(geometryId)) {
      cache.removeGeometryLoadObject(geometryId);
    }
  });
}

/**
 * One pass of `updateSurfaceData`: converts the segments of the labelmap,
 * takes the surfaces of the segments that it no longer has away, and gives
 * the others their new points and polys. A segment that the labelmap lost
 * while the pass converted gets no geometry again, and a new segment without
 * voxels gets none: an empty surface is not cached. The geometry id of a new
 * segment goes into the geometry map once its surface is cached, so a surface
 * that fails to be cached leaves no id of a missing geometry. The pass waits
 * for the surfaces that it caches before it fires SEGMENTATION_MODIFIED.
 */
async function updateSurfaceDataOnce(segmentationId: string) {
  const surfacesObj =
    await computeSurfaceFromLabelmapSegmentation(segmentationId);

  const segmentation = getSegmentation(segmentationId);
  if (!surfacesObj || !segmentation) {
    return;
  }

  const indices = getUniqueSegmentIndices(segmentationId);
  const viewportIds = getViewportIdsWithSegmentation(segmentationId);

  // if new surfaceObj does not have the same segment indices as the previous one,
  // and some were deleted, we need to remove the geometries for the deleted segments
  viewportIds.forEach((viewportId) => {
    const enabledElement = getEnabledElementByViewportId(viewportId);
    const viewport = enabledElement.viewport;
    if (viewport.type !== 'volume3d') {
      return;
    }

    const actorEntries = (viewport as VolumeViewport3D).getActors();

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

        removeSurfaceActors(viewport, filteredSurfaceActors);
        viewport.render();

        // remove the geometry from the cache
        const geometryId = `segmentation_${segmentationId}_surface_${segmentIndex}`;
        if (cache.getGeometry(geometryId)) {
          cache.removeGeometryLoadObject(geometryId);
        }
      }
    });
  });

  removeGeometriesOfRemovedSegments(
    segmentation?.representationData.Surface?.geometryIds,
    indices
  );

  const promises = surfacesObj.map(({ data, segmentIndex }) => {
    const geometryId = `segmentation_${segmentationId}_surface_${segmentIndex}`;

    const geometry = cache.getGeometry(geometryId) as Types.IGeometry;

    if (!geometry) {
      if (!indices.includes(segmentIndex) || !data.points?.length) {
        return;
      }

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
          const enabledElement = getEnabledElementByViewportId(viewportId);

          return createAndCacheSurfacesFromRaw(
            segmentationId,
            [{ segmentIndex, data }],
            {
              segmentationId: surfaceRepresentation.segmentationId,
              viewport: enabledElement.viewport,
            },
            SegmentationRepresentations.Labelmap
          ).then(() => {
            segmentation.representationData.Surface.geometryIds.set(
              segmentIndex,
              geometryId
            );
          });
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

  await Promise.all(promises.flat(2));

  triggerSegmentationModified(segmentationId);
}
