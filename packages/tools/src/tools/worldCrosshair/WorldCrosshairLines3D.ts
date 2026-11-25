import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkPoints from '@kitware/vtk.js/Common/Core/Points';
import vtkCellArray from '@kitware/vtk.js/Common/Core/CellArray';
import type { Types } from '@cornerstonejs/core';

/**
 * Isolated 3D rendering extension for the WorldCrosshairTool ("Reference
 * Point"). It renders the reference point in Generic 3D (VOLUME_3D_NEXT)
 * viewports as world-space intersecting lines along the three patient axes
 * (crossing at the point), mirroring the 2D crosshair rendering. It holds no
 * tool state: the tool passes the authoritative worldPoint in on every
 * update.
 *
 * The actor is attached through `viewport.getRenderer()`, the generic 3D
 * viewport's documented direct-integration hook for vtk-level extensions.
 */

export type WorldCrosshairLines3DOptions = {
  /** Full length of each crosshair line in world units (mm). */
  lineLengthMm: number;
  /** Line color as RGB in the range [0, 1]. */
  color: [number, number, number];
  /** Unique prefix for the actor bookkeeping, e.g. one per tool group. */
  uidPrefix: string;
};

type LinesEntry = {
  actor: ReturnType<typeof vtkActor.newInstance>;
  polyData: ReturnType<typeof vtkPolyData.newInstance>;
};

const linesByKey = new Map<string, LinesEntry>();

function getKey(viewport: Types.IViewport, uidPrefix: string): string {
  return `${viewport.id}:${uidPrefix}`;
}

/**
 * Three intersecting lines through the point, one along each patient axis
 * (X, Y and Z), so the crosshair is visible from any 3D camera angle.
 */
function setCrosshairLinePoints(
  polyData: ReturnType<typeof vtkPolyData.newInstance>,
  worldPoint: Types.Point3,
  halfLength: number
): void {
  const [x, y, z] = worldPoint;
  const points = vtkPoints.newInstance();
  points.setNumberOfPoints(6);
  points.setPoint(0, x - halfLength, y, z);
  points.setPoint(1, x + halfLength, y, z);
  points.setPoint(2, x, y - halfLength, z);
  points.setPoint(3, x, y + halfLength, z);
  points.setPoint(4, x, y, z - halfLength);
  points.setPoint(5, x, y, z + halfLength);

  const lines = vtkCellArray.newInstance({
    values: [2, 0, 1, 2, 2, 3, 2, 4, 5],
  });

  polyData.setPoints(points);
  polyData.setLines(lines);
  polyData.modified();
}

function getViewportRenderer(viewport: Types.IViewport) {
  return typeof viewport?.getRenderer === 'function'
    ? viewport.getRenderer()
    : undefined;
}

/**
 * Creates or updates the world-space crosshair line actor for the given
 * Generic 3D viewport, then renders the viewport.
 */
export function updateWorldCrosshairLines3D(
  viewport: Types.IViewport,
  worldPoint: Types.Point3,
  options: WorldCrosshairLines3DOptions
): void {
  const renderer = getViewportRenderer(viewport);
  if (!renderer || !worldPoint) {
    return;
  }

  const { lineLengthMm, color, uidPrefix } = options;
  const halfLength = Math.max(lineLengthMm / 2, 1);
  const key = getKey(viewport, uidPrefix);

  let entry = linesByKey.get(key);
  const isAttached = entry && !!renderer.getActors?.().includes(entry.actor);

  if (!entry || !isAttached) {
    if (entry) {
      renderer.removeActor(entry.actor);
    }

    const polyData = vtkPolyData.newInstance();
    setCrosshairLinePoints(polyData, worldPoint, halfLength);

    const mapper = vtkMapper.newInstance();
    mapper.setInputData(polyData);
    const actor = vtkActor.newInstance();
    actor.setMapper(mapper);
    actor.getProperty().setColor(...color);
    actor.getProperty().setLineWidth(1.5);
    actor.getProperty().setInterpolationToFlat();
    actor.getProperty().setAmbient(1.0);
    actor.getProperty().setDiffuse(0.0);
    actor.getProperty().setSpecular(0.0);

    renderer.addActor(actor);
    // Widen the clipping range so the lines are not clipped away when they
    // extend beyond the volume bounds.
    renderer.resetCameraClippingRange?.();

    entry = { actor, polyData };
    linesByKey.set(key, entry);
  } else {
    setCrosshairLinePoints(entry.polyData, worldPoint, halfLength);
  }

  viewport.render();
}

/**
 * Removes the world-space crosshair line actor from the given viewport (if
 * present) and renders the viewport.
 */
export function removeWorldCrosshairLines3D(
  viewport: Types.IViewport,
  uidPrefix: string
): void {
  const key = getKey(viewport, uidPrefix);
  const entry = linesByKey.get(key);
  linesByKey.delete(key);

  if (!entry) {
    return;
  }

  const renderer = getViewportRenderer(viewport);
  if (!renderer) {
    return;
  }

  renderer.removeActor(entry.actor);
  viewport.render();
}
