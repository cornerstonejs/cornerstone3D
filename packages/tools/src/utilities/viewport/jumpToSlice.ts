import {
  getEnabledElement,
  StackViewport,
  VolumeViewport,
  utilities as csUtils,
  Types,
} from '@cornerstonejs/core';
import JumpToSliceOptions from '../../types/JumpToSliceOptions';
import clip from '../clip';
import { scrollThroughStack } from '../stackScrollTool';

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
  options: JumpToSliceOptions
): Promise<void> {
  const { imageIndex } = options;
  const enabledElement = getEnabledElement(element);

  if (!enabledElement) {
    throw new Error('Element has been disabled');
  }

  const { viewport } = enabledElement;

  const { imageIndex: currentImageIndex, numberOfSlices } =
    _getImageSliceData(viewport);

  const imageIndexToJump = _getImageIndexToJump(numberOfSlices, imageIndex);

  const delta = imageIndexToJump - currentImageIndex;

  scrollThroughStack(viewport, { delta });
}

function _getImageSliceData(
  viewport: Types.IStackViewport | Types.IVolumeViewport
): Types.ImageSliceData {
  if (viewport instanceof StackViewport) {
    return {
      numberOfSlices: viewport.getImageIds().length,
      imageIndex: viewport.getCurrentImageIdIndex(),
    };
  } else if (viewport instanceof VolumeViewport) {
    return csUtils.getImageSliceDataForVolumeViewport(viewport);
  } else {
    throw new Error('Unsupported viewport type');
  }
}

function _getImageIndexToJump(
  numberOfSlices: number,
  imageIndex: number
): number {
  const lastSliceIndex = numberOfSlices - 1;

  return clip(imageIndex, 0, lastSliceIndex);
}

export default jumpToSlice;
