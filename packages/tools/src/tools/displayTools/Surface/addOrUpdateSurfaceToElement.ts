import {
  getEnabledElement,
  Enums,
  VolumeViewport3D,
  VolumeViewport,
  getWebWorkerManager,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkClipClosedSurface from '@kitware/vtk.js/Filters/General/ClipClosedSurface';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkCellArray from '@kitware/vtk.js/Common/Core/CellArray';
import { pointToString } from '../../../utilities/pointToString';
import { registerDisplayToolsWorker } from '../registerDisplayToolsWorker';

const workerManager = getWebWorkerManager();

const polyDataCache = new Map();

function addOrUpdateSurfaceToElement(
  element: HTMLDivElement,
  surface: Types.ISurface,
  actorUID: string
): void {
  const enabledElement = getEnabledElement(element);
  const { viewport } = enabledElement;
  const surfaceActor = viewport.getActor(actorUID)?.actor as Types.Actor;

  if (surfaceActor) {
    // we already have an actor for this surface, we just need to update it

    // Todo: figure out if the surface configuration has changed

    const surfaceMapper = surfaceActor.getMapper();
    const currentPolyData = surfaceMapper.getInputData();

    // check if the new data is the same as the old data by checking the
    // length of the points and the length of the polys

    const newPoints = surface.getPoints();
    const newPolys = surface.getPolys();

    const currentPoints = currentPolyData.getPoints().getData();
    const currentPolys = currentPolyData.getPolys().getData();

    if (
      newPoints.length === currentPoints.length &&
      newPolys.length === currentPolys.length
    ) {
      // the data is the same, we don't need to update the actor

      return;
    }

    const polyData = vtkPolyData.newInstance();
    polyData.getPoints().setData(newPoints, 3);

    const triangles = vtkCellArray.newInstance({
      values: Float32Array.from(newPolys),
    });

    polyData.setPolys(triangles);

    surfaceMapper.setInputData(polyData);
    surfaceMapper.modified();

    setTimeout(() => {
      viewport.getRenderer().resetCameraClippingRange();
    }, 0);

    return;
  }

  // Default to true since we are setting a new segmentation, however,
  // in the event listener, we will make other segmentations visible/invisible
  // based on the config
  const points = surface.getPoints();
  const polys = surface.getPolys();
  const color = surface.getColor();
  const id = surface.id;

  const surfacePolyData = vtkPolyData.newInstance();
  surfacePolyData.getPoints().setData(points, 3);

  const triangles = vtkCellArray.newInstance({
    values: Float32Array.from(polys),
  });
  surfacePolyData.setPolys(triangles);

  const mapper = vtkMapper.newInstance({});

  let clippingFilter;
  if (!(viewport instanceof VolumeViewport3D)) {
    clippingFilter = vtkClipClosedSurface.newInstance({
      clippingPlanes: [],
      activePlaneId: 2,
      passPointData: false,
    });
    clippingFilter.setInputData(surfacePolyData);
    clippingFilter.setGenerateOutline(true);
    clippingFilter.setGenerateFaces(false);
    clippingFilter.update();
    const filteredData = clippingFilter.getOutputData();
    mapper.setInputData(filteredData);

    const evt = {
      detail: {
        actorEntry: {
          actor: {
            getMapper: () => mapper,
          },
          clippingFilter,
          uid: actorUID,
        },
        vtkPlanes: viewport.getClippingPlanesForActor?.(),
        viewport,
      },
    };

    updateSurfacePlanes(evt);

    element.addEventListener(
      Enums.Events.CLIPPING_PLANES_UPDATED,
      updateSurfacePlanes
    );
  } else {
    mapper.setInputData(surfacePolyData);
  }

  const actor = vtkActor.newInstance();
  actor.setMapper(mapper);

  // sets the color of the surface actor
  actor.getProperty().setColor(color[0] / 255, color[1] / 255, color[2] / 255);

  // set line width
  // Todo: make this configurable
  actor.getProperty().setLineWidth(2);

  viewport.addActor({
    actor,
    uid: actorUID,
    clippingFilter,
  });

  if (viewport instanceof VolumeViewport) {
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

    const camera = viewport.getCamera();

    workerManager
      .executeTask(
        'displayTools',
        'clipSurfaceWithPlanes',
        {
          planesInfo,
          polyDataInfo: {
            points,
            polys,
          },
          id,
        },
        {
          callbacks: [
            // progress callback
            (progress) => {
              console.debug(progress);
            },
            // update cache callback
            ({ points, lines, sliceIndex }) => {
              const polyData = vtkPolyData.newInstance();
              polyData.getPoints().setData(points, 3);

              const linesArray = vtkCellArray.newInstance({
                values: Int16Array.from(lines),
              });
              polyData.setLines(linesArray);

              // cacheId is the sliceIndex
              const cacheId = `${viewport.id}-${pointToString(
                camera.viewPlaneNormal
              )}-${sliceIndex}`;

              let actorCache = polyDataCache.get(actorUID);
              if (!actorCache) {
                actorCache = new Map();
                polyDataCache.set(actorUID, actorCache);
              }
              actorCache.set(cacheId, polyData);

              mapper.setInputData(polyData);
            },
          ],
        }
      )
      .catch((error) => {
        console.error(error);
      });
  }

  setTimeout(() => {
    viewport.getRenderer().resetCameraClippingRange();
  }, 0);
}

/**
 * Updates the clipping planes of a surface and caches the resulting poly data
 */
function updateSurfacePlanes(evt) {
  const { actorEntry, vtkPlanes, viewport } = evt.detail;
  if (!actorEntry?.clippingFilter) {
    return;
  }
  const sliceIndex = viewport.getSliceIndex();

  const mapper = actorEntry.actor.getMapper();

  const { viewPlaneNormal } = viewport.getCamera();

  // we should not use the focalPoint here, since the pan and zoom updates it,
  // sliceIndex is reliable enough
  const cacheId = `${viewport.id}-${pointToString(
    viewPlaneNormal
  )}-${sliceIndex}`;

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
  mapper.setInputData(polyData);
}

export default addOrUpdateSurfaceToElement;
