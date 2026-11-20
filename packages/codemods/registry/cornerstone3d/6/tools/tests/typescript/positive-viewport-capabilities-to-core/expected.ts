import {
  viewportSupportsImageSlices,
  viewportSupportsStackCalibration as canCalibrate,
} from '@cornerstonejs/core/utilities';
export { viewportSupportsImageSlices as supportsImageSlices } from '@cornerstonejs/core/utilities';

export function calibrate(viewport, imageId: string) {
  if (viewportSupportsImageSlices(viewport) && canCalibrate(viewport)) {
    viewport.calibrateSpacing(imageId);
  }
}

export const checks = { viewportSupportsImageSlices };
