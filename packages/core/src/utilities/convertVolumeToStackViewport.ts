import type * as Types from '../types';
import cache from '../cache/cache';
import { ImageVolume } from '../cache/classes/ImageVolume';
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

  const { background } = options;
  const viewportId = options.viewportId || id;

  const actorEntry = volumeViewport.getDefaultActor();
  const { uid: volumeId } = actorEntry;
  const volume = cache.getVolume(volumeId);

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

  const prevView = volumeViewport.getViewReference();

  renderingEngine.enableElement(viewportInput);

  // Get the stack viewport that was created
  const stackViewport = renderingEngine.getViewport(
    viewportId
  ) as Types.IStackViewport;

  await stackViewport.setStack(volume.imageIds);

  stackViewport.setViewReference(prevView);

  // Render the image
  stackViewport.render();

  return stackViewport;
}

export { convertVolumeToStackViewport };
