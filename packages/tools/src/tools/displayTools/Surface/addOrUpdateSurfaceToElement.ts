import { getEnabledElement } from '@cornerstonejs/core';
import { utilities, type Types } from '@cornerstonejs/core';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkCellArray from '@kitware/vtk.js/Common/Core/CellArray';
import {
  getSurfaceActorEntry,
  getSurfaceRepresentationUID,
} from '../../../stateManagement/segmentation/helpers/getSegmentationActor';

function addOrUpdateSurfaceToElement(
  element: HTMLDivElement,
  surface: Types.ISurface,
  segmentationId: string
): void {
  const enabledElement = getEnabledElement(element);
  const { viewport } = enabledElement;

  const surfaceActorEntry = getSurfaceActorEntry(
    viewport.id,
    segmentationId,
    surface.segmentIndex
  );

  const surfaceActor = surfaceActorEntry?.actor as Types.Actor;

  const isVisible = surface.visible;

  if (!isVisible) {
    if (surfaceActor) {
      viewport.removeActors([surfaceActorEntry.uid]);
      viewport.render();
    }
    return;
  }

  if (surfaceActor) {
    // we already have an actor for this surface, we just need to update it

    // Todo: figure out if the surface configuration has changed

    const surfaceMapper = surfaceActor.getMapper();
    const currentPolyData = surfaceMapper.getInputData();

    // check if the new data is the same as the old data by checking the
    // length of the points and the length of the polys

    const newPoints = surface.points;
    const newPolys = surface.polys;

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

    viewport.getRenderer().resetCameraClippingRange();

    return;
  }

  // Default to true since we are setting a new segmentation, however,
  // in the event listener, we will make other segmentations visible/invisible
  // based on the config
  const points = surface.points;
  const polys = surface.polys;
  const color = surface.color;

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

  const representationUID = getSurfaceRepresentationUID(
    segmentationId,
    surface.segmentIndex
  );

  viewport.addActor({
    uid: utilities.uuidv4(),
    actor: actor as vtkActor,
    clippingFilter,
    representationUID,
  });

  viewport.resetCamera();
  viewport.getRenderer().resetCameraClippingRange();
  viewport.render();
}

export default addOrUpdateSurfaceToElement;
