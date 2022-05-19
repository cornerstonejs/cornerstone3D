import {
  getEnabledElement,
  StackViewport,
  VolumeViewport,
  utilities as csUtils,
  Types,
} from '@cornerstonejs/core';
import { JumpPresets } from '../../enums';
import JumpToSliceOptions from '../../types/JumpToSliceOptions';
import clip from '../clip';
import { scrollThroughStack } from '../stackScrollTool';

/**
 * It uses the imageIndex or predefined presets via Enums.JumpPresets.(First|Last|Middle)
 * in the Options to scroll to the slice that is intended. Defining imageIndex
 * has priority over predefined presets (if both are defined, imageIndex is used).
 * It works for both stack and volume viewports.
 *
 * @param element - the HTML Div element scrolling inside
 * @param options - the options used for scrolling
 * @returns Promise that resolves to ImageIdIndex
 */
async function jumpToSlice(
  element: HTMLDivElement,
  options: JumpToSliceOptions
): Promise<void> {
  const { imageIndex, preset } = options;
  const enabledElement = getEnabledElement(element);

  if (!enabledElement) {
    throw new Error('Element has been disabled');
  }

  const { viewport } = enabledElement;

  const { imageIndex: currentImageIndex, numberOfSlices } =
    _getImageSliceData(viewport);

  const imageIndexToJump = _getImageIndexToJump(
    numberOfSlices,
    imageIndex,
    preset
  );

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
  imageIndex?: number,
  preset?: JumpPresets
): number {
  const lastSliceIndex = numberOfSlices - 1;

  if (imageIndex !== undefined) {
    return clip(imageIndex, 0, lastSliceIndex);
  }

  if (preset === JumpPresets.First) {
    return 0;
  }

  if (preset === JumpPresets.Last) {
    return lastSliceIndex;
  }

  if (preset === JumpPresets.Middle) {
    return Math.floor(lastSliceIndex / 2);
  }
}

export default jumpToSlice;
