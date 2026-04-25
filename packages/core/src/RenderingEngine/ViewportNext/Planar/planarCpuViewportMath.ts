import type { CPUFallbackViewport, IImage, Point2 } from '../../../types';
import {
  getPlanarScaleRatio,
  type PlanarScaleInput,
} from './planarCameraScale';

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
  presentationScale?: PlanarScaleInput;
}): number | Point2 {
  const {
    canvas,
    columnPixelSpacing,
    parallelScale,
    presentationScale,
    rowPixelSpacing,
  } = args;
  const worldHeight = Math.max((parallelScale ?? 1) * 2, EPSILON);
  const worldToCanvasScale = canvas.height / worldHeight;
  const scaleRatio = getPlanarScaleRatio(presentationScale);

  if (Math.abs(scaleRatio - 1) > EPSILON) {
    const safeCanvasHeight = Math.max(canvas.height, 1);
    const safeCanvasWidth = Math.max(canvas.width, 1);
    const worldWidth =
      worldHeight * (safeCanvasWidth / safeCanvasHeight) * (1 / scaleRatio);

    return [
      Math.max(
        (safeCanvasWidth * (columnPixelSpacing || 1)) /
          Math.max(worldWidth, EPSILON),
        EPSILON
      ),
      Math.max(
        (safeCanvasHeight * (rowPixelSpacing || 1)) / worldHeight,
        EPSILON
      ),
    ];
  }

  return Math.max(
    Math.min(rowPixelSpacing || 1, columnPixelSpacing || 1) *
      worldToCanvasScale,
    EPSILON
  );
}
