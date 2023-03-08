import { getEnabledElement, Types, Enums } from '@cornerstonejs/core';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkCellArray from '@kitware/vtk.js/Common/Core/CellArray';
import vtkPoints from '@kitware/vtk.js/Common/Core/Points';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';

// Note: this seems to have performance issues when there are many contours
// but just a few contours is fine. so just keeping it here for now.
function addContourToElement(
  element: HTMLDivElement,
  contour: Types.IContour,
  actorUID: string
): vtkActor {
  const enabledElement = getEnabledElement(element);
  const { viewport } = enabledElement;

  const pointList = contour.getPoints();
  const flatPoints = contour.getFlatPointsArray();
  const color = contour.getColor();
  const type = contour.getType();

  const p = pointList.map((_, i) => i);

  if (type === Enums.ContourType.CLOSED_PLANAR) {
    p.push(0);
  }

  const var1 = Float32Array.from(flatPoints);
  const var2 = Uint32Array.from([p.length, ...p]);

  const colorToUse = color.map((c) => c / 255);

  const points = vtkPoints.newInstance();
  points.setData(var1, 3);

  const lines = vtkCellArray.newInstance();
  // @ts-ignore
  lines.setData(var2, 3);

  const polygon = vtkPolyData.newInstance();
  polygon.setPoints(points);
  polygon.setLines(lines);

  const mapper = vtkMapper.newInstance();
  mapper.setInputData(polygon);
  const actor = vtkActor.newInstance();
  actor.setMapper(mapper);
  actor.getProperty().setLineWidth(4);
  actor.getProperty().setColor(colorToUse[0], colorToUse[1], colorToUse[2]);

  viewport.addActor({ actor: actor, uid: actorUID });

  return actor;
}

export default addContourToElement;
