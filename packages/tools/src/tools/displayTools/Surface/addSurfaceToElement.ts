import { getEnabledElement } from '@cornerstonejs/core';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';

function addSurfaceToElement(
  element: HTMLDivElement,
  surface: any,
  actorUID: string
): void {
  const enabledElement = getEnabledElement(element);
  const { renderingEngine, viewport } = enabledElement;
  const { id: viewportId } = viewport;

  // Default to true since we are setting a new segmentation, however,
  // in the event listener, we will make other segmentations visible/invisible
  // based on the config
  const visibility = true;
  const immediateRender = false;
  const suppressEvents = true;

  const points = surface.getPoints();
  const polys = surface.getPolys();
  const color = surface.getColor();

  const polydata = vtkPolyData.newInstance();
  polydata.getPoints().setData(points, 3);
  polydata.getPolys().setData(polys);

  const mapper = vtkMapper.newInstance();
  mapper.setInputData(polydata, 0);

  const actor = vtkActor.newInstance();
  actor.setMapper(mapper);

  // actor.getProperty().setColor(color[0], color[1], color[2]);

  viewport.addActor({ actor, uid: actorUID });
}

export default addSurfaceToElement;
