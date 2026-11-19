import type vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import type {
  PlanarViewport,
  GenericVolumeViewport3D,
} from '@cornerstonejs/core';

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
  viewport: PlanarViewport | GenericVolumeViewport3D,
  actor: vtkActor,
  _uid: string
): void {
  const renderer = viewport.getRenderer();

  renderer.addActor(actor);
  renderer.resetCameraClippingRange();
}

/**
 * Takes a prop that a tool gave to the renderer of a 3D viewport out of the
 * scene.
 *
 * @param viewport - The 3D viewport.
 * @param actor - The vtk.js actor of the tool.
 */
export function removeToolProp(
  viewport: PlanarViewport | GenericVolumeViewport3D,
  actor: vtkActor
): void {
  viewport.getRenderer().removeActor(actor);
}
