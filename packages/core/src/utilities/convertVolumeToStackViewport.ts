import { Types, Enums, cache, utilities as csUtils } from '@cornerstonejs/core';
import { ImageVolume } from '../cache';

/**
 * Converts a volume viewport to a stack viewport.
 *
 * @param params - The parameters for the conversion.
 * @param params.viewport - The volume viewport to convert.
 * @param params.options - The conversion options.
 * @param [params.options.viewportId] - The new stackViewportId, If not provided, the volume viewport id will be used.
 * @param [params.options.background] - The background color of the stack viewport.
 * @param [params.options.decache] - Whether to decache the volume. Defaults to false.
 *
 * @returns The converted stack viewport.
 */
async function convertVolumeToStackViewport({
  viewport,
  options,
}: {
  viewport: Types.IVolumeViewport;
  options: {
    viewportId?: string;
    background?: Types.Point3;
  };
}): Promise<Types.IVolumeViewport> {
  const volumeViewport = viewport;
  const { id, element } = volumeViewport;
  const renderingEngine = viewport.getRenderingEngine();
  const imageIdIndex = viewport.getCurrentImageIdIndex();

  const { background } = options || { volumeId: csUtils.uuidv4() };
  const viewportId = options.viewportId || id;

  const actorEntry = volumeViewport.getDefaultActor();
  const { uid: volumeId } = actorEntry;
  const volume = cache.getVolume(volumeId) as Types.IImageVolume;

  if (!(volume instanceof ImageVolume)) {
    throw new Error(
      'Currently, you cannot decache a volume that is not an ImageVolume. So, unfortunately, volumes such as nifti  (which are basic Volume, without imageIds) cannot be decached.'
    );
  }

  const viewportInput = {
    viewportId,
    type: Enums.ViewportType.STACK,
    element,
    defaultOptions: {
      background,
    },
  };

  renderingEngine.enableElement(viewportInput);

  // Get the stack viewport that was created
  const stackViewport = <Types.IStackViewport>(
    renderingEngine.getViewport(viewportId)
  );

  // So here we have two scenarios that we need to handle:
  // 1. the volume was derived from a stack and we need to decache it, this is easy
  // since we just need purge the volume from the cache and those images will get
  // their copy of the image back
  // 2. It was actually a native volume and we need to decache it, this is a bit more
  // complicated since then we need to decide on the imageIds for it to get
  // decached to
  const isDerivedFromStack = volume.imageCacheOffsetMap.size > 0;
  const purgeFromCache = isDerivedFromStack ? true : false;
  volume.decache(purgeFromCache);

  const stack = volume.imageIds.reverse();
  await stackViewport.setStack(
    stack,
    Math.max(volume.imageIds.length - imageIdIndex - 1, 0)
  );

  // Render the image
  volumeViewport.render();

  return volumeViewport;
}

export { convertVolumeToStackViewport };
