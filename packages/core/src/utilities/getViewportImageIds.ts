import { VolumeViewport } from '../RenderingEngine';
import cache from '../cache/cache';
import type { IViewport, IStackViewport } from '../types';

/**
 * Retrieves the image IDs from the given viewport.
 *
 * @param viewport - The viewport to retrieve the image IDs from.
 * @returns An array of image IDs.
 */
function getViewportImageIds(viewport: IViewport) {
  if (viewport instanceof VolumeViewport) {
    const volume = cache.getVolume(viewport.getVolumeId());
    return volume.imageIds;
  } else if ((viewport as IStackViewport).getImageIds) {
    return (viewport as IStackViewport).getImageIds();
  }
}

export default getViewportImageIds;
