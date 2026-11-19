import type { Types } from '@cornerstonejs/core';

export type ImageSliceViewport = Types.IViewport & {
  getCurrentImageId(): string | undefined;
  getCurrentImageIdIndex(): number;
  getImageIds(): string[];
};

export type StackCalibrationViewport = ImageSliceViewport & {
  calibrateSpacing(imageId: string): void;
};

function viewportHasMethod<TMethod extends string>(
  viewport: unknown,
  method: TMethod
): viewport is Record<TMethod, (...args: unknown[]) => unknown> {
  return (
    typeof (viewport as Record<TMethod, unknown> | undefined)?.[method] ===
    'function'
  );
}

export function viewportSupportsImageSlices(
  viewport: unknown
): viewport is ImageSliceViewport {
  return (
    viewportHasMethod(viewport, 'getCurrentImageId') &&
    viewportHasMethod(viewport, 'getCurrentImageIdIndex') &&
    viewportHasMethod(viewport, 'getImageIds')
  );
}

export function viewportSupportsStackCalibration(
  viewport: unknown
): viewport is StackCalibrationViewport {
  return (
    viewportSupportsImageSlices(viewport) &&
    viewportHasMethod(viewport, 'calibrateSpacing')
  );
}
