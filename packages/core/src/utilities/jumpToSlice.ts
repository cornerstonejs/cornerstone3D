import clip from './clip';
import type {
  ImageSliceData,
  IStackViewport,
  IVolumeViewport,
  JumpToSliceOptions,
} from '../types';
import scroll from './scroll';
import getEnabledElement from '../getEnabledElement';
import {
  getViewportContentMode,
  isGenericViewport,
  viewportIsInStackMode,
} from './viewportCapabilities';
/**
 * It uses the imageIndex in the Options to scroll to the slice that is intended.
 * It works for both Stack and Volume viewports. In VolumeViewports, the imageIndex
 * should be given with respect to the index in the 3D image in the view direction
 * (i.e. the index of the slice in Axial, Sagittal, Coronal, or Oblique).
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
    debounceLoading
  );

  const imageIndexToJump = _getImageIndexToJump(numberOfSlices, imageIndex);
  const delta = imageIndexToJump - currentImageIndex;

  scroll(viewport, { delta, debounceLoading, volumeId });
}

/**
 * The number of slices of a viewport and the index of the slice it shows.
 *
 * A next planar viewport gives its current image index, in stack mode and
 * in volume mode: the index of the last request, which on a stack can be
 * ahead of the image that is drawn while that image loads. A legacy stack
 * viewport and a stack-mode legacy adapter give their target index when
 * `debounceLoading` is set. A legacy volume viewport gives its slice index.
 * A viewport that has no `getNumberOfSlices`, as a next ECG viewport, has one
 * slice: a jump on it moves nothing.
 */
function _getImageSliceData(
  viewport: IStackViewport | IVolumeViewport,
  debounceLoading?: boolean
): ImageSliceData {
  const hasTargetImageIdIndex =
    typeof (viewport as IStackViewport).getTargetImageIdIndex === 'function';

  if (viewportIsInStackMode(viewport) && hasTargetImageIdIndex) {
    const stackViewport = viewport as IStackViewport;

    return {
      numberOfSlices: stackViewport.getImageIds().length,
      imageIndex: debounceLoading
        ? stackViewport.getTargetImageIdIndex()
        : stackViewport.getCurrentImageIdIndex(),
    };
  }

  const mode = getViewportContentMode(viewport);

  if (
    isGenericViewport(viewport) &&
    !hasTargetImageIdIndex &&
    (mode === 'stack' || mode === 'volume')
  ) {
    return {
      numberOfSlices: viewport.getNumberOfSlices(),
      imageIndex: viewport.getCurrentImageIdIndex(),
    };
  }

  return {
    numberOfSlices: viewport.getNumberOfSlices?.() ?? 1,
    imageIndex: viewport.getSliceIndex(),
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
