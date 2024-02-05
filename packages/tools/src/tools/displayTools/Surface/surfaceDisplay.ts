import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkCellArray from '@kitware/vtk.js/Common/Core/CellArray';
import {
  cache,
  getEnabledElementByIds,
  Types,
  Enums,
  VolumeViewport,
  getWebWorkerManager,
  eventTarget,
  triggerEvent,
  utilities,
} from '@cornerstonejs/core';

import * as SegmentationState from '../../../stateManagement/segmentation/segmentationState';
import Representations from '../../../enums/SegmentationRepresentations';
import { getToolGroup } from '../../../store/ToolGroupManager';
import {
  SegmentationRepresentationConfig,
  ToolGroupSpecificRepresentation,
} from '../../../types/SegmentationStateTypes';
import { registerDisplayToolsWorker } from '../registerDisplayToolsWorker';

import removeSurfaceFromElement from './removeSurfaceFromElement';
import addOrUpdateSurfaceToElement from './addOrUpdateSurfaceToElement';
import { polySeg } from '../../../stateManagement/segmentation';
import { pointToString } from '../../../utilities';
import { WorkerTypes } from '../../../enums';
const workerManager = getWebWorkerManager();

const polyDataCache = new Map();
const currentViewportNormal = new Map();

const triggerWorkerProgress = (eventTarget, progress) => {
  triggerEvent(eventTarget, Enums.Events.WEB_WORKER_PROGRESS, {
    progress,
    type: WorkerTypes.DISPLAY_TOOL_CLIP_SURFACE,
  });
};

/**
 * It removes a segmentation representation from the tool group's viewports and
 * from the segmentation state
 * @param toolGroupId - The toolGroupId of the toolGroup that the
 * segmentationRepresentation belongs to.
 * @param segmentationRepresentationUID - This is the unique identifier
 * for the segmentation representation.
 * @param renderImmediate - If true, the viewport will be rendered
 * immediately after the segmentation representation is removed.
 */
function removeSegmentationRepresentation(
  toolGroupId: string,
  segmentationRepresentationUID: string,
  renderImmediate = false
): void {
  _removeSurfaceFromToolGroupViewports(
    toolGroupId,
    segmentationRepresentationUID
  );
  SegmentationState.removeSegmentationRepresentation(
    toolGroupId,
    segmentationRepresentationUID
  );

  if (renderImmediate) {
    const viewportsInfo = getToolGroup(toolGroupId).getViewportsInfo();
    viewportsInfo.forEach(({ viewportId, renderingEngineId }) => {
      const enabledElement = getEnabledElementByIds(
        viewportId,
        renderingEngineId
      );
      enabledElement.viewport.render();
    });
  }
}

/**
 * It renders the Surface  for the given segmentation
 * @param viewport - The viewport object
 * @param representation - ToolGroupSpecificRepresentation
 * @param toolGroupConfig - This is the configuration object for the tool group
 */
async function render(
  viewport: Types.IVolumeViewport,
  representation: ToolGroupSpecificRepresentation,
  toolGroupConfig: SegmentationRepresentationConfig
): Promise<void> {
  const {
    colorLUTIndex,
    active,
    segmentationId,
    segmentationRepresentationUID,
    segmentsHidden,
  } = representation;

  const segmentation = SegmentationState.getSegmentation(segmentationId);

  if (!segmentation) {
    return;
  }

  let SurfaceData = segmentation.representationData[Representations.Surface];

  if (
    !SurfaceData &&
    polySeg.canComputeRequestedRepresentation(segmentationRepresentationUID)
  ) {
    // we need to check if we can request polySEG to convert the other
    // underlying representations to Surface
    SurfaceData = await polySeg.computeAndAddSurfaceRepresentation(
      segmentationId,
      {
        segmentationRepresentationUID,
      }
    );

    if (!SurfaceData) {
      throw new Error(
        `No Surface data found for segmentationId ${segmentationId}.`
      );
    }
  }

  const { geometryIds } = SurfaceData;

  if (!geometryIds?.size) {
    console.warn(
      `No Surfaces found for segmentationId ${segmentationId}. Skipping render.`
    );
  }

  const colorLUT = SegmentationState.getColorLUT(colorLUTIndex);

  const surfaces = [];
  geometryIds.forEach((geometryId, segmentIndex) => {
    const geometry = cache.getGeometry(geometryId);
    if (!geometry) {
      throw new Error(`No Surfaces found for geometryId ${geometryId}`);
    }

    if (geometry.type !== Enums.GeometryType.SURFACE) {
      // Todo: later we can support converting other geometries to Surfaces
      throw new Error(
        `Geometry type ${geometry.type} not supported for rendering.`
      );
    }

    if (!geometry.data) {
      console.warn(
        `No Surfaces found for geometryId ${geometryId}. Skipping render.`
      );
      return;
    }

    const surface = geometry.data as Types.ISurface;

    const color = colorLUT[segmentIndex];
    surface.setColor(color.slice(0, 3) as Types.Point3);

    addOrUpdateSurfaceToElement(
      viewport.element,
      surface as Types.ISurface,
      segmentationRepresentationUID
    );

    surfaces.push(surface);
  });

  if (viewport instanceof VolumeViewport) {
    // const { viewPlaneNormal } = viewport.getCamera();
    // currentViewportNormal.set(surface.id, structuredClone(viewPlaneNormal));
    // if the viewport is not 3D means we should calculate
    // the clipping planes for the surface and cache the results
    generateAndCacheClippedSurfaces(
      surfaces,
      viewport,
      segmentationRepresentationUID
    );
  }

  viewport.render();
}

function _removeSurfaceFromToolGroupViewports(
  toolGroupId: string,
  segmentationRepresentationUID: string
): void {
  const toolGroup = getToolGroup(toolGroupId);

  if (toolGroup === undefined) {
    throw new Error(`ToolGroup with ToolGroupId ${toolGroupId} does not exist`);
  }

  const { viewportsInfo } = toolGroup;

  for (const viewportInfo of viewportsInfo) {
    const { viewportId, renderingEngineId } = viewportInfo;
    const enabledElement = getEnabledElementByIds(
      viewportId,
      renderingEngineId
    );
    removeSurfaceFromElement(
      enabledElement.viewport.element,
      segmentationRepresentationUID
    );
  }
}

async function generateAndCacheClippedSurfaces(
  surfaces: Types.ISurface[],
  viewport: Types.IVolumeViewport,
  segmentationRepresentationUID: string
) {
  registerDisplayToolsWorker();

  // All planes is an array of planes pairs for each slice, so we should loop over them and
  // add the planes to the clipping filter and cache the results for that slice
  const planesInfo = viewport.getSlicesClippingPlanes?.();

  const currentSliceIndex = viewport.getSliceIndex();

  // Reorder planesInfo based on proximity to currentSliceIndex
  planesInfo.sort((a, b) => {
    const diffA = Math.abs(a.sliceIndex - currentSliceIndex);
    const diffB = Math.abs(b.sliceIndex - currentSliceIndex);
    return diffA - diffB;
  });

  const pointsAndPolys = surfaces.map((surface) => {
    const id = surface.id;
    const points = surface.getPoints();
    const polys = surface.getPolys();

    return { id, points, polys };
  });

  const camera = viewport.getCamera();

  function cameraModifiedCallback(evt: Types.EventTypes.CameraModifiedEvent) {
    const { camera } = evt.detail;
    const { viewPlaneNormal } = camera;

    // Note: I think choosing one of the surfaces to see
    // if the viewPlaneNormal is the same for all surfaces is ok enough
    // to decide if we should recompute the clipping planes
    const surface1 = surfaces[0];

    if (
      utilities.isEqual(viewPlaneNormal, currentViewportNormal.get(surface1.id))
    ) {
      return;
    }

    currentViewportNormal.set(surface1.id, viewPlaneNormal);

    workerManager.terminate('displayTools');

    setTimeout(() => {
      generateAndCacheClippedSurfaces(
        surfaces,
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

  await workerManager
    .executeTask(
      'displayTools',
      'clipSurfaceWithPlanes',
      {
        planesInfo,
        pointsAndPolys,
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
export function getOrCreatePolyData(actorEntry, cacheId, vtkPlanes) {
  let actorCache = polyDataCache.get(actorEntry.uid);
  if (!actorCache) {
    actorCache = new Map();
    polyDataCache.set(actorEntry.uid, actorCache);
  }

  let polyData = actorCache.get(cacheId);
  if (!polyData) {
    const clippingFilter = actorEntry.clippingFilter;
    clippingFilter.setClippingPlanes(vtkPlanes);
    try {
      clippingFilter.update();
      polyData = clippingFilter.getOutputData();
      actorCache.set(cacheId, polyData);
    } catch (e) {
      console.error('Error clipping surface', e);
    }
  }
  return polyData;
}

// Helper function to update PolyData cache
export function updatePolyDataCache(actorUID, cacheId, polyDataResult) {
  const { points, lines } = polyDataResult;
  const polyData = vtkPolyData.newInstance();
  polyData.getPoints().setData(points, 3);
  const linesArray = vtkCellArray.newInstance({
    values: Int16Array.from(lines),
  });
  polyData.setLines(linesArray);

  let actorCache = polyDataCache.get(actorUID);
  if (!actorCache) {
    actorCache = new Map();
    polyDataCache.set(actorUID, actorCache);
  }
  actorCache.set(cacheId, polyData);
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

export default {
  render,
  removeSegmentationRepresentation,
};

export { render, removeSegmentationRepresentation, polyDataCache };
