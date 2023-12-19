import {
  Types,
  Enums,
  volumeLoader,
  setVolumesForViewports,
  utilities as csUtils,
} from '@cornerstonejs/core';

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
}): Promise<void> {
  const renderingEngine = viewport.getRenderingEngine();
  const { volumeId, background } = options || { volumeId: csUtils.uuidv4() };

  const { id, element } = viewport;
  const viewportId = options.viewportId || id;

  const prevCamera = viewport.getCamera();

  const volumeLoaderScheme = volumeId.split(':')[0];

  let imageIds = viewport.getImageIds();
  imageIds = imageIds.map((imageId) => {
    const imageURI = csUtils.imageIdToURI(imageId);
    return `${volumeLoaderScheme}:${imageURI}`;
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

  // Define a volume in memory
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

  // preserve the slice location when switching from stack to volume
  // element.addEventListener(Enums.Events.VOLUME_VIEWPORT_NEW_VOLUME, () => {
  //   volumeViewport.setCamera({
  //     focalPoint: prevCamera.focalPoint,
  //   });
  //   volumeViewport.render();
  // });

  volumeViewport.render();
}

export { convertStackToVolumeViewport };
