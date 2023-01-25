import { getEnabledElement, Types, Enums } from '@cornerstonejs/core';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkCellArray from '@kitware/vtk.js/Common/Core/CellArray';
import vtkPoints from '@kitware/vtk.js/Common/Core/Points';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';

function addContourToElement(
  element: HTMLDivElement,
  contour: Types.IContour,
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

  const pointList = contour.getPoints();
  const flatPoints = contour.getFlatPointsArray();
  const color = contour.getColor();

  // createPolyData();
  // return;

  const var1 = Float32Array.from(flatPoints);
  const var2 = Uint32Array.from([
    pointList.length,
    ...pointList.map((_, i) => i),
  ]);

  // Todo: add the closed property to the contour

  const points = vtkPoints.newInstance();
  points.setData(var1, 3);

  const lines = vtkCellArray.newInstance();
  lines.setData(var2, 3);

  const polygon = vtkPolyData.newInstance();
  polygon.setPoints(points);
  polygon.setLines(lines);

  const mapper1 = vtkMapper.newInstance();
  mapper1.setInputData(polygon);
  const actor1 = vtkActor.newInstance();
  actor1.setMapper(mapper1);
  actor1.getProperty().setLineWidth(4);
  actor1.getProperty().setColor(...color.map((c) => c / 255));

  viewport.addActor({ actor: actor1, uid: actorUID });
}

export default addContourToElement;
