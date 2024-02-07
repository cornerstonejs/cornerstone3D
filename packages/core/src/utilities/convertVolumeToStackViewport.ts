import * as Types from '../types';
import cache, { ImageVolume } from '../cache';
import { ViewportType } from '../enums';

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
}): Promise<Types.IStackViewport> {
  const volumeViewport = viewport;
  const { id, element } = volumeViewport;
  const renderingEngine = viewport.getRenderingEngine();
  const imageIdIndex = viewport.getCurrentImageIdIndex();

  const { background } = options;
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
    type: ViewportType.STACK,
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
  const hasCachedImages = volume.imageCacheOffsetMap.size > 0;
  // Initialize the variable to hold the final result
  let isAllImagesCached = false;

  if (hasCachedImages) {
    // Check if every imageId in the volume is in the _imageCache
    isAllImagesCached = volume.imageIds.every((imageId) =>
      cache.getImage(imageId)
    );
  }

  const volumeUsedInOtherViewports = renderingEngine
    .getVolumeViewports()
    .find((vp) => vp.hasVolumeId(volumeId));

  volume.decache(!volumeUsedInOtherViewports && isAllImagesCached);

  const stack = [...volume.imageIds].reverse();

  let imageIdIndexToJump = Math.max(
    volume.imageIds.length - imageIdIndex - 1,
    0
  );

  // Check to see if the image is already cached or not. If it's not, we will use another
  // nearby imageId for the first image to jump to. There seem to be a lot of side effects
  // if we jump to an image that is not cached in stack viewport while we convert
  // from a volume viewport. For example, if we switch back and forth between stack and volume,
  // and then try to jump to an image that is not cached, the image will not render at
  // all when the full volume is filled. I'm not sure why yet.
  const imageToJump = cache.getImage(stack[imageIdIndexToJump]);
  if (!imageToJump) {
    let minDistance = Infinity;
    let minDistanceIndex = null;

    stack.forEach((imageId, index) => {
      const image = cache.getImage(imageId);
      if (image) {
        const distance = Math.abs(imageIdIndexToJump - index);
        if (distance < minDistance) {
          minDistance = distance;
          minDistanceIndex = index;
        }
      }
    });

    imageIdIndexToJump = minDistanceIndex;
  }

  await stackViewport.setStack(stack, imageIdIndexToJump ?? 0);

  // Render the image
  stackViewport.render();

  return stackViewport;
}

export { convertVolumeToStackViewport };
