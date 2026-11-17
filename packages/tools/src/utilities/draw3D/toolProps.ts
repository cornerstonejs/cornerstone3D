import type vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import type { Types } from '@cornerstonejs/core';

/**
 * Whether a prop of a tool on this 3D viewport belongs to the tool: a direct
 * next 3D viewport, whose scene the tool reaches through the vtk.js renderer.
 * A legacy 3D viewport and a legacy adapter have `addActor`, and keep a prop
 * of a tool among their actors.
 */
export function toolOwnsProps(viewport: Types.IViewport): boolean {
  return (
    typeof (viewport as Partial<Types.IVolumeViewport>).addActor !== 'function'
  );
}

/**
 * Puts a prop of a tool, a handle or a line, into the scene of a 3D viewport.
 * On a direct next 3D viewport the tool gives it to the vtk.js renderer, keeps
 * it, and takes it out again with `removeToolProp`. A legacy 3D viewport and a
 * legacy adapter take it as an actor of the viewport under the UID.
 *
 * @param viewport - The 3D viewport.
 * @param actor - The vtk.js actor of the tool.
 * @param uid - The UID of the actor on a legacy viewport.
 */
export function addToolProp(
  viewport: Types.IVolumeViewport,
  actor: vtkActor,
  uid: string
): void {
  if (!toolOwnsProps(viewport)) {
    viewport.addActor({ actor, uid });

    return;
  }

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
