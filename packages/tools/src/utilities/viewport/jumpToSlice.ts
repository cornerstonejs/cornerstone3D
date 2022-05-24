import {
  getEnabledElement,
  StackViewport,
  VolumeViewport,
  utilities as csUtils,
} from '@cornerstonejs/core';
import JumpToSliceOptions from '../../types/JumpToSliceOptions';
import { scrollThroughStack } from '../stackScrollTool';

/**
 * It uses the imageIndex in the Options to scroll to the slice that is intended.
 * It works for any enabledElements (both stack and volume viewports)
 *
 * @param element - the HTML Div element scrolling inside
 * @param options - the options used for scrolling
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

  let currentImageIndex;
  if (viewport instanceof StackViewport) {
    currentImageIndex = viewport.getCurrentImageIdIndex();
  } else if (viewport instanceof VolumeViewport) {
    const { imageIndex } = csUtils.getImageSliceDataForVolumeViewport(viewport);
    currentImageIndex = imageIndex;
  } else {
    throw new Error('Unsupported viewport type');
  }
  const delta = imageIndex - currentImageIndex;

  scrollThroughStack(viewport, { delta });
}

export default jumpToSlice;
