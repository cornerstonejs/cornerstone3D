import { getEnabledElement, StackViewport } from '@cornerstonejs/core';
import JumpToSliceOptions from '../../types/JumpToSliceOptions';

/**
 * It uses the imageIdIndex in the Options to scroll to the slice that is intended.
 *
 * @privateRemarks Currently, only supports imageIdIndex in the options, but
 * could be extended to support other types of options such as camera position,
 * focal point, etc. for volume viewports.
 *
 * @param element - the HTML Div element scrolling inside
 * @param options - the options used for scrolling
 * @returns Promise that resolves to ImageIdIndex
 */
function jumpToSlice(
  element: HTMLDivElement,
  options: JumpToSliceOptions
): Promise<string> {
  const { imageIdIndex } = options;
  if (imageIdIndex === undefined) {
    throw new Error('Cannot jump to slice without an imageIdIndex yet');
  }

  const enabledElement = getEnabledElement(element);

  if (!enabledElement) {
    throw new Error('Element has been disabled');
  }

  const { viewport } = enabledElement;

  if (!(viewport instanceof StackViewport)) {
    throw new Error('Cannot scroll to slice on a non-stack viewport yet');
  }

  return viewport.setImageIdIndex(imageIdIndex);
}

export default jumpToSlice;
