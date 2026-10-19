import type { Point3, VoxelGrid } from '../../../types';
import getSpacingInNormalDirection from '../../../utilities/getSpacingInNormalDirection';

type ViewportSpacingLike = {
  canvas?: { clientHeight?: number; height?: number };
  sHeight?: number;
  getCamera?: () =>
    | { parallelScale?: number; viewPlaneNormal?: Point3 }
    | undefined;
};

export type DisplaySpacingOptions = {
  /** The grid that the render path draws; the result follows its index axes. */
  grid?: VoxelGrid;
  /** The full-resolution grid of the source volume. Defaults to `grid`. */
  sourceGrid?: VoxelGrid;
  /** True for a 3D view, where a rotation can bring any axis into the plane. */
  volume3D?: boolean;
};

/**
 * Display spacing on each index axis of `grid`, as `compareVoxelQuality`
 * reads it (FIDELITY-STATE-6, GENVIEW-FIDELITY-3):
 *
 * - an axis in the view plane gets the world size of one display pixel,
 *   `2 * parallelScale / canvasHeight`;
 * - in a slice view, the axis normal to the view plane gets the slice spacing
 *   of the source volume, so a reduction on that axis stays visible;
 * - in a 3D view, every axis gets the display pixel size.
 *
 * An oblique axis blends the two values by its angle to the view plane
 * normal: `sqrt(p² (1 - c²) + s² c²)`, with `c = |axis · normal|`.
 *
 * Without a grid, or without a view plane normal, every axis gets the display
 * pixel size. Returns undefined when the camera or the canvas is not ready;
 * callers then compare reduction factors without magnification.
 */
export function displaySpacingOfViewport(
  viewport: ViewportSpacingLike,
  options: DisplaySpacingOptions = {}
): Point3 | undefined {
  const camera = viewport.getCamera?.();
  const parallelScale = camera?.parallelScale;
  const height =
    viewport.canvas?.clientHeight ||
    viewport.canvas?.height ||
    viewport.sHeight;

  if (!(parallelScale > 0) || !(height > 0)) {
    return undefined;
  }

  const pixel = (2 * parallelScale) / height;
  const { grid, volume3D } = options;
  const normal = camera.viewPlaneNormal;

  if (!grid || volume3D || !normal) {
    return [pixel, pixel, pixel];
  }

  const sourceGrid = options.sourceGrid ?? grid;
  const slice = getSpacingInNormalDirection(sourceGrid, normal);

  if (!(slice > 0)) {
    return [pixel, pixel, pixel];
  }

  const spacing = [pixel, pixel, pixel] as Point3;

  for (let axis = 0; axis < 3; axis++) {
    const offset = axis * 3;
    const c = Math.abs(
      grid.direction[offset] * normal[0] +
        grid.direction[offset + 1] * normal[1] +
        grid.direction[offset + 2] * normal[2]
    );
    const normalPart = Math.min(1, c * c);

    spacing[axis] = Math.sqrt(
      pixel * pixel * (1 - normalPart) + slice * slice * normalPart
    );
  }

  return spacing;
}
