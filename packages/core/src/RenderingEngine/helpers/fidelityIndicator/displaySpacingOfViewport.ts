import type { Point2, Point3, VoxelGrid } from '../../../types';
import getSpacingInNormalDirection from '../../../utilities/getSpacingInNormalDirection';

/** What the fidelity needs to know about the display of one viewport. */
export type FidelityDisplay = {
  /** World size of one device pixel in the view plane. */
  pixelSpacing: number;
  /** Normal of the view plane; a slice view needs it. */
  viewPlaneNormal?: Point3;
  /** True for a 3D view, where a rotation can bring any axis into the plane. */
  volume3D?: boolean;
};

type CameraViewportLike = {
  canvas?: { clientHeight?: number; height?: number };
  sHeight?: number;
  getCamera?: () =>
    | { parallelScale?: number; viewPlaneNormal?: Point3 }
    | undefined;
};

/**
 * The display of a legacy viewport, from its camera: one device pixel is
 * `2 * parallelScale / canvas.height`. The canvas holds device pixels.
 */
export function fidelityDisplayOfCamera(
  viewport: CameraViewportLike,
  volume3D = false
): FidelityDisplay | undefined {
  const camera = viewport.getCamera?.();
  const parallelScale = camera?.parallelScale;
  const height =
    viewport.canvas?.height ||
    viewport.canvas?.clientHeight ||
    viewport.sHeight;

  if (!(parallelScale > 0) || !(height > 0)) {
    return undefined;
  }

  return {
    pixelSpacing: (2 * parallelScale) / height,
    viewPlaneNormal: camera.viewPlaneNormal,
    volume3D,
  };
}

/**
 * World size of one device pixel, from a `canvasToWorld` that takes CSS pixel
 * coordinates (GENVIEW-FIDELITY-3). A box average that is lossless at CSS
 * pixels can be lossy at `devicePixelRatio` 2, so the result divides by it.
 */
export function pixelSpacingOfCanvasToWorld(
  canvasToWorld: (canvasPos: Point2) => Point3
): number | undefined {
  const a = canvasToWorld([0, 0]);
  const b = canvasToWorld([1, 0]);
  const cssPixel = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const ratio = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;

  return cssPixel > 0 && Number.isFinite(cssPixel)
    ? cssPixel / ratio
    : undefined;
}

/**
 * Display spacing on each index axis of `grid`, as `compareVoxelQuality`
 * reads it (FIDELITY-RECORD-2):
 *
 * - an axis in the view plane gets the pixel size `p`;
 * - in a slice view, the axis normal to the view plane gets the slice spacing
 *   `S` of the source volume, so a reduction on that axis stays visible;
 * - an oblique axis gets `min(p / sqrt(1 - c²), S / c)`, with
 *   `c = |axis · normal|`: the finer of the two samplings along that axis;
 * - in a 3D view, every axis gets `p`.
 *
 * No axis asks for a spacing finer than the source spacing on that axis,
 * because a view is lossy only against the full stored data.
 */
export function displaySpacingForGrid(
  display: FidelityDisplay,
  grid: VoxelGrid,
  sourceGrid: VoxelGrid = grid
): Point3 {
  const { pixelSpacing: pixel, viewPlaneNormal: normal, volume3D } = display;
  const slice =
    !volume3D && normal ? getSpacingInNormalDirection(sourceGrid, normal) : 0;
  const spacing = [pixel, pixel, pixel] as Point3;

  for (let axis = 0; axis < 3; axis++) {
    if (slice > 0) {
      const offset = axis * 3;
      const c = Math.min(
        1,
        Math.abs(
          grid.direction[offset] * normal[0] +
            grid.direction[offset + 1] * normal[1] +
            grid.direction[offset + 2] * normal[2]
        )
      );
      const inPlane =
        c < 1 - 1e-9 ? pixel / Math.sqrt(1 - c * c) : Number.POSITIVE_INFINITY;
      const alongNormal = c > 1e-9 ? slice / c : Number.POSITIVE_INFINITY;

      const blended = Math.min(inPlane, alongNormal);

      // A bad direction must not give an infinite spacing, which reads as
      // lossless; the pixel size is the safe, finer value.
      spacing[axis] = Number.isFinite(blended) ? blended : pixel;
    }

    spacing[axis] = Math.max(spacing[axis], sourceGrid.spacing[axis] || 0);
  }

  return spacing;
}

/** The display spacing of one viewport without a grid: the pixel size. */
export function displaySpacingOfDisplay(
  display: FidelityDisplay | undefined
): Point3 | undefined {
  return display
    ? [display.pixelSpacing, display.pixelSpacing, display.pixelSpacing]
    : undefined;
}

/**
 * Display spacing of a legacy viewport (see {@link displaySpacingForGrid}).
 * Without a grid, every axis gets the pixel size.
 */
export function displaySpacingOfViewport(
  viewport: CameraViewportLike,
  options: { grid?: VoxelGrid; sourceGrid?: VoxelGrid; volume3D?: boolean } = {}
): Point3 | undefined {
  const display = fidelityDisplayOfCamera(viewport, options.volume3D);

  if (!display || !options.grid) {
    return displaySpacingOfDisplay(display);
  }

  return displaySpacingForGrid(display, options.grid, options.sourceGrid);
}
