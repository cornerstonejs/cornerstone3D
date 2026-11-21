import clip from './clip';
import type { ImageSliceData, IViewport, JumpToSliceOptions } from '../types';
import type PlanarViewport from '../RenderingEngine/GenericViewport/Planar/PlanarViewport';
import scroll, {
  countPlanarVolumeScrollSteps,
  getPlanarVolumeScrollSteps,
} from './scroll';
import getEnabledElement from '../getEnabledElement';
import { getViewportContentMode } from './viewportCapabilities';
/**
 * It uses the imageIndex in the Options to scroll to the slice that is intended.
 * It works in stack mode and in volume mode. In volume mode, the imageIndex
 * should be given with respect to the index in the 3D image in the view direction
 * (i.e. the index of the slice in Axial, Sagittal, Coronal, or Oblique).
 * With the `volumeId` of another volume that a planar viewport shows in
 * volume mode, the imageIndex counts the slices of that volume along the
 * view, as `utilities.scroll` steps with that `volumeId`.
 *
 * @param element - the HTML Div element scrolling inside
 * @param options - the options used for jumping to a slice
 * @returns Promise that resolves to ImageIdIndex
 */
async function jumpToSlice(
  element: HTMLDivElement,
  options = {} as JumpToSliceOptions
): Promise<void> {
  const { imageIndex, debounceLoading, volumeId } = options;
  const enabledElement = getEnabledElement(element);

  if (!enabledElement) {
    throw new Error('Element has been disabled');
  }

  const { viewport } = enabledElement;

  const { imageIndex: currentImageIndex, numberOfSlices } = _getImageSliceData(
    viewport,
    volumeId
  );

  const imageIndexToJump = _getImageIndexToJump(numberOfSlices, imageIndex);
  const delta = imageIndexToJump - currentImageIndex;

  scroll(viewport, { delta, debounceLoading, volumeId });
}

/**
 * The number of slices of a viewport and the index of the slice it shows.
 *
 * A planar viewport gives its current image index, in stack mode and in
 * volume mode: the index of the last request, which on a stack can be ahead
 * of the image that is drawn while that image loads. Another viewport gives
 * its slice index. A viewport that has no `getNumberOfSlices`, as an ECG
 * viewport, has one slice: a jump on it moves nothing. A viewport that has no
 * `getSliceIndex`, as a 3D viewport, is at slice 0, as the 5.x 3D viewport
 * with its one slice: a jump on it moves nothing either.
 *
 * With the `volumeId` of another volume that a planar viewport shows in
 * volume mode, the slices are those of that volume along the view, counted
 * as `utilities.scroll` counts its steps.
 */
function _getImageSliceData(
  viewport: IViewport,
  volumeId?: string
): ImageSliceData {
  const mode = getViewportContentMode(viewport);

  if (mode === 'stack' || mode === 'volume') {
    const planarViewport = viewport as PlanarViewport;
    const steps = volumeId
      ? getPlanarVolumeScrollSteps(planarViewport, { volumeId })
      : undefined;

    if (steps) {
      const { numScrollSteps, currentStepIndex } =
        countPlanarVolumeScrollSteps(steps);

      return {
        numberOfSlices: numScrollSteps + 1,
        imageIndex: currentStepIndex,
      };
    }

    return {
      numberOfSlices: planarViewport.getNumberOfSlices(),
      imageIndex: planarViewport.getCurrentImageIdIndex(),
    };
  }

  const sliceViewport = viewport as IViewport & {
    getNumberOfSlices?(): number;
    getSliceIndex?(): number;
  };

  return {
    numberOfSlices: sliceViewport.getNumberOfSlices?.() ?? 1,
    imageIndex: sliceViewport.getSliceIndex?.() ?? 0,
  };
}

function _getImageIndexToJump(
  numberOfSlices: number,
  imageIndex: number
): number {
  const lastSliceIndex = numberOfSlices - 1;

  return clip(imageIndex, 0, lastSliceIndex);
}

export { jumpToSlice };
