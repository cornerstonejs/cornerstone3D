import type { IGenericViewport, IViewport, IStackViewport } from '../types';

/**
 * Retrieves the image IDs from the given viewport.
 *
 * @param viewport - The viewport to retrieve the image IDs from.
 * @returns An array of image IDs.
 */
function getViewportImageIds(viewport: IViewport | IGenericViewport) {
  if ((viewport as IStackViewport).getImageIds) {
    return (viewport as IStackViewport).getImageIds();
  }
}

export default getViewportImageIds;
