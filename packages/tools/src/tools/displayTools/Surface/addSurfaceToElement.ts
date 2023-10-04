import { getEnabledElement } from '@cornerstonejs/core';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import { VolumeViewport } from '@cornerstonejs/core';
import vtkClipClosedSurface from '@kitware/vtk.js/Filters/General/ClipClosedSurface';
import vtkCellArray from '@kitware/vtk.js/Common/Core/CellArray';
import vtkContourTriangulator from '@kitware/vtk.js/Filters/General/ContourTriangulator';

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
  if (viewport instanceof VolumeViewport) {
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

  actor.getProperty().setColor(color[0] / 255, color[1] / 255, color[2] / 255);
  //actor.getProperty().setLineWidth(10);
  viewport.addActor({
    actor,
    uid: actorUID,
    clippingFilter,
    polyDataMapper: new Map(),
  });
}

export default addSurfaceToElement;
