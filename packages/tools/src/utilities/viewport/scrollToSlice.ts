import { Types, getEnabledElement, StackViewport } from '@cornerstonejs/core';

type Metadata = {
  imageIdIndex?: number;
  /**
   * The position of the camera in world space
   */
  cameraPosition?: Types.Point3;
  /**
   * The focal point of the camera in world space
   */
  cameraFocalPoint?: Types.Point3;
  /**
   * The normal on which the tool was drawn
   */
  viewPlaneNormal?: Types.Point3;
  /**
   * The viewUp on which the tool was drawn.
   */
  viewUp?: Types.Point3;
  /**
   * The FrameOfReferenceUID
   */
  FrameOfReferenceUID: string;
};

/**
 * It uses the metadata to scroll to the slice that is intended. Currently,
 * only supports imageIdIndex in the metadata, but could be extended to
 * support other types of metadata such as camera position, focal point, etc.
 * for volume viewports.
 * @param element - the HTML Div element scrolling inside
 * @param metadata - the metadata used for scrolling
 * @returns Promise that resolves to ImageIdIndex
 */
function scrollToSlice(
  element: HTMLDivElement,
  metadata: Metadata
): Promise<string> {
  const { imageIdIndex } = metadata;
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

export default scrollToSlice;
