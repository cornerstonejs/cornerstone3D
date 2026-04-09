import type { CPUFallbackViewport, IImage } from '../../../types';

const EPSILON = 1e-6;

export function resolvePlanarCpuImageDisplayedArea(
  image: IImage
): CPUFallbackViewport['displayedArea'] {
  return {
    tlhc: {
      x: 1.5,
      y: 1.5,
    },
    brhc: {
      x: Math.max(image.columns + 0.5, 1.5),
      y: Math.max(image.rows + 0.5, 1.5),
    },
    rowPixelSpacing: image.rowPixelSpacing ?? 1,
    columnPixelSpacing: image.columnPixelSpacing ?? 1,
    presentationSizeMode: 'NONE',
  };
}

export function resolvePlanarCpuViewportScale(args: {
  canvas: HTMLCanvasElement;
  parallelScale?: number;
  rowPixelSpacing: number;
  columnPixelSpacing: number;
}): number {
  const { canvas, columnPixelSpacing, parallelScale, rowPixelSpacing } = args;
  const worldHeight = Math.max((parallelScale ?? 1) * 2, EPSILON);
  const worldToCanvasScale = canvas.height / worldHeight;

  return Math.max(
    Math.min(rowPixelSpacing || 1, columnPixelSpacing || 1) *
      worldToCanvasScale,
    EPSILON
  );
}
