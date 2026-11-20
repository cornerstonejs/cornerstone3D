import type { ImageSliceViewport } from '@cornerstonejs/tools/utilities/viewportCapabilities';
import * as capabilities from '@cornerstonejs/tools/utilities/viewportCapabilities';
import {
  viewportSupportsStackCalibration,
  viewportSupportsStackCompatibility,
} from '@cornerstonejs/tools/utilities/viewportCapabilities';
import {
  type StackCalibrationViewport,
  viewportSupportsImageSlices,
} from '@cornerstonejs/tools/utilities/viewportCapabilities';
export {
  viewportSupportsImageSlices as supportsImageSlices,
  type ImageSliceViewport as SliceViewport,
} from '@cornerstonejs/tools/utilities/viewportCapabilities';
export * from '@cornerstonejs/tools/utilities/viewportCapabilities';

export function check(
  viewport: ImageSliceViewport | StackCalibrationViewport
): boolean {
  return (
    capabilities.viewportSupportsImageSlices(viewport) &&
    viewportSupportsStackCalibration(viewport) &&
    viewportSupportsStackCompatibility(viewport) &&
    viewportSupportsImageSlices(viewport)
  );
}
