import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkPoints from '@kitware/vtk.js/Common/Core/Points';
import vtkCellArray from '@kitware/vtk.js/Common/Core/CellArray';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import type { Types } from '@cornerstonejs/core';

/**
 * Add a 3D line between two points in the viewport
 * @param viewport - The viewport to add the line to
 * @param point1 - First point [x, y, z]
 * @param point2 - Second point [x, y, z]
 * @param color - RGB color array [r, g, b] (default: [0.7, 0.7, 0.7])
 * @param uid - Unique identifier for the line
 * @param showHandles - Whether handles are visible (affects line visibility)
 * @returns Object with actor and source
 */
export function addLine3DBetweenPoints(
  viewport: Types.IVolumeViewport,
  point1: Types.Point3,
  point2: Types.Point3,
  color: [number, number, number] = [0.7, 0.7, 0.7],
  uid = '',
  showHandles = true
): { actor: vtkActor | null; source: vtkPolyData | null } {
  // Avoid creating a line if the points are the same
  if (
    point1[0] === point2[0] &&
    point1[1] === point2[1] &&
    point1[2] === point2[2]
  ) {
    return { actor: null, source: null };
  }
  const points = vtkPoints.newInstance();
  points.setNumberOfPoints(2);
  points.setPoint(0, point1[0], point1[1], point1[2]);
  points.setPoint(1, point2[0], point2[1], point2[2]);

  const lines = vtkCellArray.newInstance({ values: [2, 0, 1] });
  const polyData = vtkPolyData.newInstance();
  polyData.setPoints(points);
  polyData.setLines(lines);

  const mapper = vtkMapper.newInstance();
  mapper.setInputData(polyData);
  const actor = vtkActor.newInstance();
  actor.setMapper(mapper);
  actor.getProperty().setColor(...color);
  actor.getProperty().setLineWidth(0.5); // Thinner line
  actor.getProperty().setOpacity(1.0);
  actor.getProperty().setInterpolationToFlat(); // No shading
  actor.getProperty().setAmbient(1.0); // Full ambient
  actor.getProperty().setDiffuse(0.0); // No diffuse
  actor.getProperty().setSpecular(0.0); // No specular
  actor.setVisibility(showHandles);
  viewport.addActor({ actor, uid });
  return { actor, source: polyData };
}
