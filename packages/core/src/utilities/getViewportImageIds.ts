import { VolumeViewport } from '../RenderingEngine/index.js';
import cache from '../cache/index.js';
import { IViewport, IStackViewport } from '../types/index.js';

/**
 * Retrieves the image IDs from the given viewport.
 *
 * @param viewport - The viewport to retrieve the image IDs from.
 * @returns An array of image IDs.
 */
function getViewportImageIds(viewport: IViewport) {
  if (viewport instanceof VolumeViewport) {
    const defaultActor = viewport.getDefaultActor();
    const volumeId = defaultActor.uid;
    const volume = cache.getVolume(volumeId);
    return volume.imageIds;
  } else if ((viewport as IStackViewport).getImageIds) {
    return (viewport as IStackViewport).getImageIds();
  }
}

export default getViewportImageIds;
