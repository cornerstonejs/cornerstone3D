import {
  Types,
  Enums,
  volumeLoader,
  setVolumesForViewports,
  utilities,
  cache,
} from '@cornerstonejs/core';
import { StreamingImageVolume } from '@cornerstonejs/streaming-image-volume-loader';
import { Types as cstTypes } from '@cornerstonejs/tools';

const { ViewportType } = Enums;
const VOLUME_LOADER_SCHEME = 'wadors';

function _convertVolumeToStackViewport(
  renderingEngine: Types.IRenderingEngine,
  viewport: Types.IVolumeViewport,
  toolGroup: cstTypes.IToolGroup
): void {
  const { id, element } = viewport;

  // Create a stack viewport
  const viewportInput = {
    viewportId: id,
    type: ViewportType.STACK,
    element,
    defaultOptions: {
      background: <Types.Point3>[0.4, 0, 0.4],
    },
  };

  renderingEngine.enableElement(viewportInput);

  // Set the tool group on the viewport
  toolGroup.addViewport(id, renderingEngine.id);

  // Get the stack viewport that was created
  const stackViewport = <Types.IStackViewport>renderingEngine.getViewport(id);

  const actorEntry = viewport.getDefaultActor();
  const { uid: volumeId } = actorEntry;
  const volume = cache.getVolume(volumeId) as StreamingImageVolume;

  // if this is the first time decaching do it
  volume.decache();

  const stack = volume.imageIds.reverse();

  stackViewport.setStack(stack, 0);

  // Render the image
  viewport.render();
}

async function _convertStackToVolumeViewport(
  renderingEngine: Types.IRenderingEngine,
  viewport: Types.IStackViewport,
  toolGroup: cstTypes.IToolGroup
): Promise<void> {
  // Define a unique id for the volume
  const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
  const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
  const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id

  const { id, element } = viewport;

  const prevCamera = viewport.getCamera();

  let imageIds = viewport.getImageIds();
  imageIds = imageIds.map((imageId) => {
    const imageURI = utilities.imageIdToURI(imageId);
    return `${VOLUME_LOADER_SCHEME}:${imageURI}`;
  });

  const viewportInputArray = [
    {
      viewportId: id,
      type: ViewportType.ORTHOGRAPHIC,
      element,
      defaultOptions: {
        background: <Types.Point3>[0.2, 0.4, 0.2],
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);

  // we need to add back the viewport to the toolGroup since volume viewport
  // is replacing the stack viewport, and on stackViewport destroy, the toolGroup
  // will remove the viewport from the toolGroup
  toolGroup.addViewport(id, renderingEngine.id);

  // Define a volume in memory
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  // Set the volume to load
  volume.load();
  const volumeViewport = <Types.IVolumeViewport>renderingEngine.getViewport(id);

  setVolumesForViewports(
    renderingEngine,
    [
      {
        volumeId,
      },
    ],
    [id]
  );

  // preserve the slice location when switching from stack to volume
  element.addEventListener(Enums.Events.VOLUME_VIEWPORT_NEW_VOLUME, () => {
    volumeViewport.setCamera({
      focalPoint: prevCamera.focalPoint,
    });
    volumeViewport.render();
  });

  volumeViewport.render();
}

export { _convertStackToVolumeViewport, _convertVolumeToStackViewport };
