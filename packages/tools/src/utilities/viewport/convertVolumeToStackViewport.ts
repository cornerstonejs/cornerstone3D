import { Types, Enums, cache, utilities as csUtils } from '@cornerstonejs/core';

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

  // Create a stack viewport
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

  const actorEntry = volumeViewport.getDefaultActor();
  const { uid: volumeId } = actorEntry;
  const volume = cache.getVolume(volumeId) as Types.IImageVolume;

  // if this is the first time decaching do it
  // volume.decache();

  const stack = volume.imageIds.reverse();

  stackViewport.setStack(stack, volume.imageIds.length - imageIdIndex - 1);

  // Render the image
  volumeViewport.render();

  return volumeViewport;
}

export { convertVolumeToStackViewport };
