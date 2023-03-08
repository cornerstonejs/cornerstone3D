import { getEnabledElement, Types, Enums } from '@cornerstonejs/core';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkCellArray from '@kitware/vtk.js/Common/Core/CellArray';
import vtkPoints from '@kitware/vtk.js/Common/Core/Points';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';

/**
 * It takes a contour set, creates a vtkPolyData from it, and adds it to the
 * viewport
 * @param element - HTMLDivElement - the div element that contains the cornerstone image
 * @param contourSet - the contour set that you want to add to the element.
 * @param actorUID - string - the unique identifier for the actor.
 * @returns actor
 */
function addContourSetToElement(
  element: HTMLDivElement,
  contourSet: Types.IContourSet,
  actorUID: string
): vtkActor {
  const enabledElement = getEnabledElement(element);
  const { viewport } = enabledElement;

  const actor = vtkActor.newInstance();
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
    // add the current points into the point list
    pointArray.push(...linePoints);
    // add the point indexes into the cell array
    lines.insertNextCell([...pointIndexes]);
    // update the first point index
    pointIndex = pointIndex + pointList.length;
  });

  // converts the pointArray into vtkPoints
  points.setData(pointArray, 3);

  // creates the polyData
  const polygon = vtkPolyData.newInstance();
  polygon.setPoints(points);
  polygon.setLines(lines);

  const mapper = vtkMapper.newInstance();
  mapper.setInputData(polygon);
  actor.setMapper(mapper);
  actor.getProperty().setLineWidth(4);

  // despite each contour can have its own color, we assign the last color to
  // all contours
  const colorToUse = color.map((c) => c / 255);
  actor.getProperty().setColor(colorToUse[0], colorToUse[1], colorToUse[2]);

  viewport.addActor({
    actor: actor,
    uid: actorUID,
  });

  viewport.render();
  return actor;
}

export default addContourSetToElement;
