import cache from '../cache/cache';
import type { IViewport, IStackViewport, IVolumeViewport } from '../types';
import {
  getViewportContentMode,
  isGenericViewport,
} from './viewportCapabilities';

/**
 * Retrieves the image IDs from the given viewport.
 *
 * @param viewport - The viewport to retrieve the image IDs from.
 * @returns An array of image IDs.
 */
function getViewportImageIds(viewport: IViewport) {
  if (
    getViewportContentMode(viewport) === 'volume' &&
    !isGenericViewport(viewport)
  ) {
    const volume = cache.getVolume((viewport as IVolumeViewport).getVolumeId());
    return volume.imageIds;
  } else if ((viewport as IStackViewport).getImageIds) {
    return (viewport as IStackViewport).getImageIds();
  }
}

export default getViewportImageIds;
