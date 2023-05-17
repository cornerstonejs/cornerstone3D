import { StackViewport, Types } from '..';
import getEnabledElement from '../getEnabledElement';

/**
 * Gets the IImage rendered by the given element. This is provided as a
 * convenience for the legacy cornerstone getImage function. However it is
 * encouraged for IStackViewport.getImage to be used instead.
 * @param element - the element rendering/containing the image
 * @returns the image
 */
function getImageLegacy(element: HTMLDivElement): Types.IImage | undefined {
  const enabledElement = getEnabledElement(element);

  if (!enabledElement) {
    return;
  }

  const { viewport } = enabledElement;

  if (!(viewport instanceof StackViewport)) {
    throw new Error(
      `An image can only be fetched for a stack viewport and not for a viewport of type: ${viewport.type}`
    );
  }

  return viewport.getCornerstoneImage();
}

export default getImageLegacy;
