import type { Types } from '@cornerstonejs/core';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkCellArray from '@kitware/vtk.js/Common/Core/CellArray';

/**
 * The points and the polys arrays of the surface that an actor draws, with
 * their number of values when the actor took them. The arrays can change in
 * place, so their lengths are kept apart from them.
 */
type ShownSurface = Pick<Types.ISurface, 'points' | 'polys'> & {
  pointsLength: number;
  polysLength: number;
};

/**
 * The surface data that each actor draws, so that an actor takes new data
 * when a surface gets other arrays or arrays of another length.
 */
const shownSurfaceByActor = new WeakMap<vtkActor, ShownSurface>();

/**
 * The record of the points and the polys of a surface that an actor draws.
 *
 * @param surface - The surface.
 * @returns Its arrays and their lengths.
 */
function getShownSurface(surface: Types.ISurface): ShownSurface {
  return {
    points: surface.points,
    polys: surface.polys,
    pointsLength: surface.points.length,
    polysLength: surface.polys.length,
  };
}

/**
 * The vtk.js poly data of the points and the polys of a surface.
 *
 * @param surface - The surface.
 * @returns The poly data.
 */
function createSurfacePolyData(surface: Types.ISurface): vtkPolyData {
  const polyData = vtkPolyData.newInstance();

  polyData.getPoints().setData(surface.points, 3);
  polyData.setPolys(
    vtkCellArray.newInstance({ values: Float32Array.from(surface.polys) })
  );

  return polyData;
}

/**
 * Makes the vtk.js actor of a surface of a segmentation: its points and polys
 * in the colour of the surface, with a line width of 2.
 *
 * @param surface - The surface, with its colour.
 * @returns The actor.
 */
function createSurfaceActor(surface: Types.ISurface): vtkActor {
  const mapper = vtkMapper.newInstance({});
  const actor = vtkActor.newInstance();
  const [r, g, b] = surface.color;

  mapper.setInputData(createSurfacePolyData(surface));
  actor.setMapper(mapper);
  actor.getProperty().setColor(r / 255, g / 255, b / 255);
  actor.getProperty().setLineWidth(2);
  shownSurfaceByActor.set(actor, getShownSurface(surface));

  return actor;
}

/**
 * Gives the actor of a surface the points and the polys of the surface when
 * the surface has other points or polys arrays than the ones that the actor
 * draws, as the 3D viewport does at each render, or when one of its arrays
 * got another number of values in place, as when a face is appended. New
 * arrays of the same lengths are new data too.
 *
 * @param actor - The actor of the surface.
 * @param surface - The surface.
 * @returns Whether the actor got new data.
 */
function updateSurfaceActorData(
  actor: Types.Actor,
  surface: Types.ISurface
): boolean {
  const mapper = actor.getMapper() as vtkMapper;
  const shownSurface = shownSurfaceByActor.get(actor as vtkActor);

  if (
    shownSurface?.points === surface.points &&
    shownSurface?.polys === surface.polys &&
    shownSurface.pointsLength === surface.points.length &&
    shownSurface.polysLength === surface.polys.length
  ) {
    return false;
  }

  mapper.setInputData(createSurfacePolyData(surface));
  mapper.modified();
  shownSurfaceByActor.set(actor as vtkActor, getShownSurface(surface));

  return true;
}

export { createSurfaceActor, createSurfacePolyData, updateSurfaceActorData };
