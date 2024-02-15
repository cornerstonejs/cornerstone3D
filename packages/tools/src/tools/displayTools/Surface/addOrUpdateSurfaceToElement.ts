import { getEnabledElement } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkCellArray from '@kitware/vtk.js/Common/Core/CellArray';
import { getSurfaceActorUID } from '../../../stateManagement/segmentation/helpers/clipAndCacheSurfacesForViewport';

function addOrUpdateSurfaceToElement(
  element: HTMLDivElement,
  surface: Types.ISurface,
  segmentationRepresentationUID: string
): void {
  const actorUID = getSurfaceActorUID(
    segmentationRepresentationUID,
    surface.id
  );

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

  const surfacePolyData = vtkPolyData.newInstance();
  surfacePolyData.getPoints().setData(points, 3);

  const triangles = vtkCellArray.newInstance({
    values: Float32Array.from(polys),
  });
  surfacePolyData.setPolys(triangles);

  const mapper = vtkMapper.newInstance({});

  let clippingFilter;
  mapper.setInputData(surfacePolyData);

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

  viewport.resetCamera();
  viewport.render();

  setTimeout(() => {
    viewport.getRenderer().resetCameraClippingRange();
  }, 0);
}

export default addOrUpdateSurfaceToElement;
