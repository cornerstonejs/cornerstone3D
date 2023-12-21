import {
  Types,
  Enums,
  cache,
  eventTarget,
  volumeLoader,
  setVolumesForViewports,
  utilities as csUtils,
} from '@cornerstonejs/core';

/**
 * Converts a stack viewport to a volume viewport.
 *
 * @param params - The parameters for the conversion.
 * @param params.viewport - The stack viewport to convert.
 * @param params.options - The options for the conversion.
 * @param [params.options.volumeId] - The volumeId that will get generated, it should have the volume loader schema inside too
 * @param [params.options.viewportId] - The viewportId that will get used for new viewport. If not provided, the stack viewport id will be used.
 * @param [params.options.background] - The background color of the volume viewport.
 * @returns The converted volume viewport.
 */
async function convertStackToVolumeViewport({
  viewport,
  options,
}: {
  viewport: Types.IStackViewport;
  options: {
    volumeId?: string;
    viewportId?: string;
    background?: Types.Point3;
  };
}): Promise<Types.IVolumeViewport> {
  const renderingEngine = viewport.getRenderingEngine();

  const { volumeId, background } = options;

  const { id, element } = viewport;
  const viewportId = options.viewportId || id;

  const prevCamera = viewport.getCamera();

  let imageIds = viewport.getImageIds();

  // get the image loader scheme
  const imageLoaderScheme = imageIds[0].split(':')[0];

  imageIds = imageIds.map((imageId) => {
    const imageURI = csUtils.imageIdToURI(imageId);
    return `${imageLoaderScheme}:${imageURI}`;
  });

  // this will disable the stack viewport and remove it from the toolGroup
  renderingEngine.enableElement({
    viewportId,
    type: Enums.ViewportType.ORTHOGRAPHIC,
    element,
    defaultOptions: {
      background,
    },
  });

  // Define a volume in memory based on the stack imageIds
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  // Set the volume to load
  volume.load();

  // we should get the new viewport from the renderingEngine since the stack viewport
  // was disabled and replaced with a volume viewport of the same id
  const volumeViewport = <Types.IVolumeViewport>(
    renderingEngine.getViewport(viewportId)
  );

  setVolumesForViewports(
    renderingEngine,
    [
      {
        volumeId,
      },
    ],
    [viewportId]
  );

  const volumeViewportNewVolumeHandler = () => {
    volumeViewport.setCamera({
      ...prevCamera,
    });
    volumeViewport.render();

    element.removeEventListener(
      Enums.Events.VOLUME_VIEWPORT_NEW_VOLUME,
      volumeViewportNewVolumeHandler
    );
  };

  const addVolumeViewportNewVolumeListener = () => {
    element.addEventListener(
      Enums.Events.VOLUME_VIEWPORT_NEW_VOLUME,
      volumeViewportNewVolumeHandler
    );
  };

  addVolumeViewportNewVolumeListener();

  volumeViewport.render();

  return volumeViewport;
}

export { convertStackToVolumeViewport };
