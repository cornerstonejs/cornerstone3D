import { getEnabledElement, Types, Enums } from '@cornerstonejs/core';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkCellArray from '@kitware/vtk.js/Common/Core/CellArray';
import vtkPoints from '@kitware/vtk.js/Common/Core/Points';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';

// Todo: this seems to have performance issues when there are many contours
// Maybe we should not create one actor per contour, but rather one actor per
// contourSet?
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

  const mapper1 = vtkMapper.newInstance();
  mapper1.setInputData(polygon);
  const actor1 = vtkActor.newInstance();
  actor1.setMapper(mapper1);
  actor1.getProperty().setLineWidth(4);
  actor1.getProperty().setColor(colorToUse[0], colorToUse[1], colorToUse[2]);

  viewport.addActor({ actor: actor1, uid: actorUID });
}

function addContourSetToElement(
  element: HTMLDivElement,
  contourSet: Types.IContourSet,
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

  const actor1 = vtkActor.newInstance();
  let color;

  const pointArray = [];

  const points = vtkPoints.newInstance();
  const lines = vtkCellArray.newInstance();

  // this variable will indicate the index of the first point in the current line
  // so we can correctly generate the point index list to add in the cellArray
  let pointIndex = 0;
  contourSet.getContours().forEach((contour: Types.IContour) => {
    const pointList = contour.getPoints();
    const flatPoints = contour.getFlatPointsArray();
    color = contour.getColor();
    const type = contour.getType();

    // creating a point index list that defines a line
    const pointIndexes = pointList.map((_, i) => i + pointIndex);

    // if close planar, add the first point index to the list
    if (type === Enums.ContourType.CLOSED_PLANAR) {
      pointIndexes.push(pointIndexes[0]);
    }

    const linePoints = Float32Array.from(flatPoints);
    // add the curent points into the point list
    pointArray.push(...linePoints);
    // add the point indexes into the cell array
    lines.insertNextCell([...pointIndexes]);
    // update the first point index
    pointIndex = pointIndex + pointList.length;
  });

  // converts the pointArray into vtkPoints
  points.setData(pointArray, 3);

  // creates the polydata
  const polygon = vtkPolyData.newInstance();
  polygon.setPoints(points);
  polygon.setLines(lines);

  const mapper1 = vtkMapper.newInstance();
  mapper1.setInputData(polygon);
  actor1.setMapper(mapper1);
  actor1.getProperty().setLineWidth(4);

  // despite each contour can have its own color, we assign the last color to
  // all contours
  const colorToUse = color.map((c) => c / 255);
  actor1.getProperty().setColor(colorToUse[0], colorToUse[1], colorToUse[2]);

  viewport.addActor({ actor: actor1, uid: actorUID });
}

export { addContourToElement, addContourSetToElement };
