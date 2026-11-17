import { utilities, type Types } from '@cornerstonejs/core';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkCellArray from '@kitware/vtk.js/Common/Core/CellArray';
import { resetViewportCamera } from '../../../utilities/setViewportCamera';
import {
  getSurfaceActorEntry,
  getSurfaceRepresentationUID,
} from '../../../stateManagement/segmentation/helpers/getSegmentationActor';
import {
  addOrUpdateSurfaceDisplaySet,
  showsSurfacesAsDisplaySets,
} from './surfaceDisplaySet';

/**
 * Shows a surface of a segmentation on a 3D viewport, or updates the one that
 * the viewport shows. On a direct next 3D viewport the surface is a geometry
 * display set, and the promise resolves when it is mounted. On a legacy 3D
 * viewport and on a legacy adapter it is an actor of the application, added
 * before the function returns.
 *
 * @param viewport - The 3D viewport.
 * @param surface - The surface, with its colour and its visibility.
 * @param segmentationId - The id of the segmentation of the surface.
 * @param geometryId - The id of the cached geometry of the surface, which a
 * next 3D viewport mounts. The id of the surface when not given.
 */
async function addOrUpdateSurfaceToElement(
  viewport: Types.IVolumeViewport,
  surface: Types.ISurface,
  segmentationId: string,
  geometryId: string = surface.id
): Promise<void> {
  if (showsSurfacesAsDisplaySets(viewport)) {
    return addOrUpdateSurfaceDisplaySet(
      viewport,
      geometryId,
      surface,
      segmentationId
    );
  }

  const surfaceActorEntry = getSurfaceActorEntry(
    viewport.id,
    segmentationId,
    surface.segmentIndex
  );

  const surfaceActor = surfaceActorEntry?.actor as Types.Actor;

  const isVisible = surface.visible;

  if (surfaceActor) {
    surfaceActor.setVisibility(isVisible);

    if (!isVisible) {
      return;
    }
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

  resetViewportCamera(viewport);
  viewport.getRenderer().resetCameraClippingRange();
  viewport.render();
}

export default addOrUpdateSurfaceToElement;
