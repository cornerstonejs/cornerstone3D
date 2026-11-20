import {
  viewportSupportsImageSlices,
  viewportSupportsStackCalibration as canCalibrate,
} from '@cornerstonejs/tools/utilities/viewportCapabilities';
export { viewportSupportsImageSlices as supportsImageSlices } from '@cornerstonejs/tools/utilities/viewportCapabilities';

export function calibrate(viewport, imageId: string) {
  if (viewportSupportsImageSlices(viewport) && canCalibrate(viewport)) {
    viewport.calibrateSpacing(imageId);
  }
}

export const checks = { viewportSupportsImageSlices };
