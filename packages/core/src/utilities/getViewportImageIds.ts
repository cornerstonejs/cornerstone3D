import type { IViewport } from '../types';

/**
 * Retrieves the image IDs from the given viewport.
 *
 * @param viewport - The viewport to retrieve the image IDs from.
 * @returns An array of image IDs.
 */
function getViewportImageIds(viewport: IViewport) {
  const imageViewport = viewport as IViewport & {
    getImageIds?(): string[];
  };

  if (imageViewport.getImageIds) {
    return imageViewport.getImageIds();
  }
}

export default getViewportImageIds;
