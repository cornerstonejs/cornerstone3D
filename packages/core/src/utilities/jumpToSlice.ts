import clip from './clip';
import type {
  ImageSliceData,
  IStackViewport,
  IVolumeViewport,
  JumpToSliceOptions,
} from '../types';
import scroll from './scroll';
import getEnabledElement from '../getEnabledElement';
import StackViewport from '../RenderingEngine/StackViewport';
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

function _getImageSliceData(
  viewport: IStackViewport | IVolumeViewport,
  debounceLoading?: boolean
): ImageSliceData {
  if (viewport instanceof StackViewport) {
    return {
      numberOfSlices: viewport.getImageIds().length,
      imageIndex: debounceLoading
        ? viewport.getTargetImageIdIndex()
        : viewport.getCurrentImageIdIndex(),
    };
  }
  return {
    numberOfSlices: viewport.getNumberOfSlices(),
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
