import type { ViewportWidget } from './Volume3D/viewport3DTypes';

/**
 * Disables every widget and takes the actor of a widget out of its renderer.
 * A next viewport with a vtk.js renderer, planar or 3D, calls it when the
 * rendering engine disables the viewport.
 *
 * @param widgets - The widgets that the viewport keeps.
 */
export function disableViewportWidgets(
  widgets: Iterable<ViewportWidget>
): void {
  for (const widget of widgets) {
    if (widget.getEnabled?.()) {
      widget.setEnabled(false);
    }

    const actor = widget.getActor?.();
    const renderer = widget.getRenderer?.();

    if (actor && renderer) {
      renderer.removeActor(actor);
    }
  }
}
