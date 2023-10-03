import { getEnabledElement } from '@cornerstonejs/core';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import { VolumeViewport } from '@cornerstonejs/core';

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
  polydata.getPolys().setData(polys);

  const mapper = vtkMapper.newInstance({});
  mapper.setInputData(polydata);

  const actor = vtkActor.newInstance();
  actor.setMapper(mapper);

  actor.getProperty().setColor(color[0] / 255, color[1] / 255, color[2] / 255);
  //actor.getProperty().setLineWidth(10);
  viewport.addActor({
    actor,
    uid: actorUID,
    polydata,
    vtkPlanes: [vtkPlane.newInstance(), vtkPlane.newInstance()],
    outline: viewport instanceof VolumeViewport,
  });
}

export default addSurfaceToElement;
