import {
  getEnabledElement,
  Enums,
  VolumeViewport3D,
} from '@cornerstonejs/core';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkClipClosedSurface from '@kitware/vtk.js/Filters/General/ClipClosedSurface';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkCellArray from '@kitware/vtk.js/Common/Core/CellArray';
import { pointToString } from '../../../utilities/pointToString';

const polyDataCache = new Map();

/**
 * Updates the clipping planes of a surface and caches the resulting poly data
 * @param evt
 */
function updateClippingPlanes(evt) {
  const { actorEntry, focalPoint, vtkPlanes } = evt.detail;
  if (actorEntry?.clippingFilter) {
    const mapper = actorEntry.actor.getMapper();
    const focalIndex = pointToString(focalPoint);
    let actorCache = polyDataCache.get(actorEntry.uid);
    if (!actorCache) {
      actorCache = new Map();
      polyDataCache.set(actorEntry.uid, actorCache);
    }
    let polyData = actorCache.get(focalIndex);
    if (!polyData) {
      const clippingFilter = actorEntry.clippingFilter;
      clippingFilter.setClippingPlanes(vtkPlanes);
      try {
        clippingFilter.update();
        polyData = clippingFilter.getOutputData();
        actorCache.set(focalIndex, polyData);
      } catch {
        console.error('Error clipping surface');
      }
    }
    mapper.setInputData(polyData);
  }
}

function addSurfaceToElement(
  element: HTMLDivElement,
  surface: any,
  actorUID: string
): void {
  const enabledElement = getEnabledElement(element);
  const { viewport } = enabledElement;

  // Default to true since we are setting a new segmentation, however,
  // in the event listener, we will make other segmentations visible/invisible
  // based on the config
  const points = surface.getPoints();
  const polys = surface.getPolys();
  const color = surface.getColor();

  const polydata = vtkPolyData.newInstance();
  polydata.getPoints().setData(points, 3);

  const triangles = vtkCellArray.newInstance({
    values: Float32Array.from(polys),
  });
  polydata.setPolys(triangles);

  const mapper = vtkMapper.newInstance({});
  let clippingFilter;
  if (!(viewport instanceof VolumeViewport3D)) {
    clippingFilter = vtkClipClosedSurface.newInstance({
      clippingPlanes: [],
      activePlaneId: 2,
      passPointData: false,
    });
    clippingFilter.setInputData(polydata);
    clippingFilter.setGenerateOutline(true);
    clippingFilter.setGenerateFaces(false);
    clippingFilter.update();
    const filteredData = clippingFilter.getOutputData();
    mapper.setInputData(filteredData);
  } else {
    mapper.setInputData(polydata);
  }

  const actor = vtkActor.newInstance();
  actor.setMapper(mapper);

  // sets the color of the surface actor
  actor.getProperty().setColor(color[0] / 255, color[1] / 255, color[2] / 255);
  viewport.addActor({
    actor,
    uid: actorUID,
    clippingFilter,
  });

  element.addEventListener(
    Enums.Events.CLIPPING_PLANES_UPDATED,
    updateClippingPlanes
  );
}

export default addSurfaceToElement;
