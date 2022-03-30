import { CPUFallbackEnabledElement, IImage } from '../../../../types';

/**
 * Determine whether or not an Enabled Element needs to be re-rendered.
 *
 * If the imageId has changed, or if any of the last rendered viewport
 * parameters have changed, this function will return true.
 *
 * @param enabledElement - An Enabled Element
 * @param image - An Image
 * @returns Whether - or not the Enabled Element needs to re-render its image
 */
export default function doesImageNeedToBeRendered(
  enabledElement: CPUFallbackEnabledElement,
  image: IImage
): boolean {
  const lastRenderedImageId = enabledElement.renderingTools.lastRenderedImageId;
  const lastRenderedViewport =
    enabledElement.renderingTools.lastRenderedViewport;

  return (
    image.imageId !== lastRenderedImageId ||
    !lastRenderedViewport ||
    lastRenderedViewport.windowCenter !==
      enabledElement.viewport.voi.windowCenter ||
    lastRenderedViewport.windowWidth !==
      enabledElement.viewport.voi.windowWidth ||
    lastRenderedViewport.invert !== enabledElement.viewport.invert ||
    lastRenderedViewport.rotation !== enabledElement.viewport.rotation ||
    lastRenderedViewport.hflip !== enabledElement.viewport.hflip ||
    lastRenderedViewport.vflip !== enabledElement.viewport.vflip ||
    lastRenderedViewport.modalityLUT !== enabledElement.viewport.modalityLUT ||
    lastRenderedViewport.voiLUT !== enabledElement.viewport.voiLUT ||
    lastRenderedViewport.colormap !== enabledElement.viewport.colormap
  );
}
