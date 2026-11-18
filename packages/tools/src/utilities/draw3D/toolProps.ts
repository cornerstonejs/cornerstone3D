import type vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import type { Types } from '@cornerstonejs/core';

/**
 * Whether a prop of a tool on this 3D viewport belongs to the tool: every
 * next 3D viewport, whose scene the tool reaches through the vtk.js renderer.
 */
export function toolOwnsProps(_viewport: Types.IViewport): boolean {
  return true;
}

/**
 * Puts a prop of a tool, a handle or a line, into the scene of a 3D viewport.
 * The tool gives it to the vtk.js renderer, keeps it, and takes it out
 * again with `removeToolProp`.
 *
 * @param viewport - The 3D viewport.
 * @param actor - The vtk.js actor of the tool.
 * @param _uid - The UID of the actor, which a legacy viewport used.
 */
export function addToolProp(
  viewport: Types.IVolumeViewport,
  actor: vtkActor,
  _uid: string
): void {
  const renderer = viewport.getRenderer();

  renderer.addActor(actor);
  renderer.resetCameraClippingRange();
}

/**
 * Takes a prop that a tool gave to the renderer of a direct next 3D viewport
 * out of the scene. A legacy 3D viewport and a legacy adapter keep the actor,
 * as before.
 *
 * @param viewport - The 3D viewport.
 * @param actor - The vtk.js actor of the tool.
 */
export function removeToolProp(
  viewport: Types.IVolumeViewport,
  actor: vtkActor
): void {
  if (toolOwnsProps(viewport)) {
    viewport.getRenderer().removeActor(actor);
  }
}
